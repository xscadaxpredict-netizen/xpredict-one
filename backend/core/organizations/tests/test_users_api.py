"""
`/api/v1/orgs/<slug>/admin/users/` -- the Administration users endpoints.

THE BIGGEST TEST SURFACE IN THE PROJECT, and it is mostly about refusals.
Three rules meet here and they fail differently, which is the thing to keep
straight while reading:

- **Scope** -> 404. A person outside the caller's dealership has to be
  indistinguishable from one who does not exist, or a dealer admin maps
  another dealership's staff by probing ids.
- **Capability** -> 403. The caller is openly a member and the answer to this
  action is still no.
- **State** -> 409. The request is well-formed, entitled and permitted, and
  the world does not allow it -- the owner, a taken address, a locked sign-in
  address.

TWO TABLES, ONE LIST (C51). Half these tests exist because a person who has
not accepted is an `Invitation` and not a `Membership`, so every endpoint has
to handle both and it is easy to write one that silently handles only
memberships.
"""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Invitation,
    Membership,
    MembershipRole,
    MembershipStatus,
)
from core.organizations.selectors import org_users
from core.organizations.services import INVITATION_LIFETIME, sign_up
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

LIST_URL = "/api/v1/orgs/{slug}/admin/users/"
DETAIL_URL = "/api/v1/orgs/{slug}/admin/users/{id}/"
INVITE_URL = "/api/v1/orgs/{slug}/admin/invitations/"
ACTION_URL = "/api/v1/orgs/{slug}/admin/users/{id}/{action}/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Motors", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def dms_role(code):
    return Role.objects.get(app=AppCode.DMS, code=code)


def add_person(organization, *, unit=None, role_code="dms.sales_representative", email, standing=
               MembershipRole.MEMBER, status=MembershipStatus.ACTIVE):
    user = User.objects.create_user(email=email, password="x", first_name="A", last_name="B")
    membership = Membership.objects.create(
        user=user, organization=organization, unit=unit, role=standing, status=status
    )
    if role_code:
        AppAccess.objects.create(membership=membership, app=AppCode.DMS, role=dms_role(role_code))
    return membership


def add_invitation(organization, *, unit=None, email, role_code="dms.sales_representative"):
    invitation = Invitation.objects.create(
        organization=organization,
        unit=unit,
        email=email,
        first_name="Pending",
        last_name="Person",
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )
    if role_code:
        invitation.app_grants.create(app=AppCode.DMS, role=dms_role(role_code))
    return invitation


def payload(**overrides) -> dict:
    return {
        "first_name": "New",
        "last_name": "Person",
        "email": "new@acme.test",
        "unit_id": None,
        "role": "member",
        "apps": [{"app": "dms", "role": "dms.group_operations"}],
        **overrides,
    }


class TestTheList:
    def test_it_shows_members_and_people_who_have_not_accepted(self, client):
        """
        THE UNION (C51). A pending person has no membership row, so a list
        built from `Membership` alone shows an organization that is missing
        everybody it has just invited.
        """
        result = found()
        add_person(result.organization, email="member@acme.test")
        add_invitation(result.organization, email="pending@acme.test", role_code=None)
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        by_email = {p["email"]: p for p in response.json()}
        assert by_email["member@acme.test"]["status"] == "active"
        assert by_email["pending@acme.test"]["status"] == "invited"
        assert by_email["owner@acme.test"]["role"] == "owner"

    def test_the_fields_are_exactly_what_users_ts_declares(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert set(response.json()[0]) == {
            "id",
            "first_name",
            "last_name",
            "email",
            "unit_id",
            "unit_name",
            "role",
            "status",
            "apps",
            "administers",
        }

    def test_a_grant_carries_the_role_code_and_its_name(self, client):
        """
        Both, deliberately. The list displays the name and the edit form
        matches the code; sending only the name made that form compare display
        strings to work out which role somebody already held.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))
        owner = next(p for p in response.json() if p["role"] == "owner")

        assert owner["apps"] == [
            {"app": "dms", "role_code": "dms.group_operations", "role_name": "Group operations"}
        ]

    def test_a_dealership_is_named_and_not_only_referenced(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        add_person(result.organization, unit=unit, email="dealer@acme.test")
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))
        person = next(p for p in response.json() if p["email"] == "dealer@acme.test")

        assert person["unit_name"] == "Whitefield"
        assert person["unit_id"] == str(unit.id)


class TestOrdering:
    def test_the_newest_person_is_last(self):
        """
        ARRIVAL ORDER, NOT ALPHABETICAL. You invite somebody and then look for
        them; a name-sorted list drops them at an unpredictable point in the
        middle, while arrival order always puts them in the same place.

        Written against the selector rather than the endpoint because the
        ordering is the selector's job, and a test that went through HTTP
        would be asserting it two layers away from where it happens.
        """
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)

        # THE NAMES HAVE TO DISAGREE WITH THE ARRIVAL ORDER or this test passes
        # under either rule and proves nothing -- which is what the first
        # version did, because the helpers name everybody the same thing.
        # "Zoe" arrives second and sorts last; "Aaron" arrives last and sorts
        # first.
        second = add_person(result.organization, email="zoe@acme.test")
        second.user.first_name = "Zoe"
        second.user.save(update_fields=["first_name"])

        third = add_invitation(result.organization, email="aaron@acme.test", role_code=None)
        third.first_name = "Aaron"
        third.save(update_fields=["first_name"])

        people = org_users(result.organization, owner)

        assert [p.id for p in people] == [owner.id, second.id, third.id]
        # Said twice on purpose: the id order is the rule, and this is the
        # thing the owner actually asked for.
        assert people[-1].email == "aaron@acme.test"


class TestAdministersIsAFactNotAName:
    """
    C53. There is no Role row for Administration, so "Organisation admin" and
    "Dealer admin" are copy describing a derived state --- the browser picks
    the words and the server sends which kind.
    """

    def test_an_owner_administers_the_organisation(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))
        owner = next(p for p in response.json() if p["role"] == "owner")

        assert owner["administers"] == "organisation"
        # And Administration is NOT in `apps`: it is never an AppAccess row.
        assert [a["app"] for a in owner["apps"]] == ["dms"]

    def test_a_dealer_admin_administers_a_dealer_while_standing_stays_member(self, client):
        """
        C40 from both sides at once. Their standing is `member` --- the check
        constraint refuses anything else with a dealership attached --- and
        what makes them an admin is the DMS System administrator role.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        add_person(
            result.organization, unit=unit, email="da@acme.test", role_code="dms.system_admin"
        )
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))
        person = next(p for p in response.json() if p["email"] == "da@acme.test")

        assert person["administers"] == "dealer"
        assert person["role"] == "member"

    def test_a_salesperson_administers_nothing(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        add_person(result.organization, unit=unit, email="sales@acme.test")
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))
        person = next(p for p in response.json() if p["email"] == "sales@acme.test")

        assert person["administers"] is None


class TestDealerIsolation:
    """
    The plan's dealer-isolation requirement. Two dealerships in one
    organization; each dealer admin sees their own people and nobody else's,
    and the refusals are 404 rather than 403.
    """

    @pytest.fixture
    def two_dealers(self):
        result = found()
        mine = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        theirs = BusinessUnit.objects.create(organization=result.organization, name="Guindy")
        admin = add_person(
            result.organization, unit=mine, email="da@acme.test", role_code="dms.system_admin"
        )
        return result, mine, theirs, admin

    def test_a_dealer_admin_sees_only_their_own_dealerships_people(self, client, two_dealers):
        result, mine, theirs, admin = two_dealers
        add_person(result.organization, unit=mine, email="ours@acme.test")
        add_person(result.organization, unit=theirs, email="theirs@acme.test")
        client.force_authenticate(user=admin.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        emails = {p["email"] for p in response.json()}
        assert emails == {"da@acme.test", "ours@acme.test"}
        # The owner is organization-wide and therefore not theirs to see.
        assert "owner@acme.test" not in emails

    def test_pending_people_at_another_dealership_are_hidden_too(self, client, two_dealers):
        """
        THE EASY HALF TO FORGET. Filtering the memberships and leaving the
        invitations unscoped is the same leak one table over, and it only shows
        up when somebody has an outstanding invitation.
        """
        result, mine, theirs, admin = two_dealers
        add_invitation(result.organization, unit=mine, email="ourpending@acme.test")
        add_invitation(result.organization, unit=theirs, email="theirpending@acme.test")
        client.force_authenticate(user=admin.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        emails = {p["email"] for p in response.json()}
        assert "ourpending@acme.test" in emails
        assert "theirpending@acme.test" not in emails

    def test_editing_somebody_at_another_dealership_is_404(self, client, two_dealers):
        result, _mine, theirs, admin = two_dealers
        other = add_person(result.organization, unit=theirs, email="theirs@acme.test")
        client.force_authenticate(user=admin.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=other.id),
            payload(email="theirs@acme.test", unit_id=str(theirs.id),
                    apps=[{"app": "dms", "role": "dms.manager"}]),
            format="json",
        )

        # 404 and NOT 403: a 403 confirms that id belongs to somebody.
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    def test_a_dealer_admin_cannot_move_their_person_to_another_dealership(
        self, client, two_dealers
    ):
        """
        CHECKED AT BOTH ENDS. The person is theirs to manage, so a check on the
        source alone passes -- and they would have handed somebody to a
        dealership they have no authority over.
        """
        result, mine, theirs, admin = two_dealers
        person = add_person(result.organization, unit=mine, email="ours@acme.test")
        client.force_authenticate(user=admin.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id),
            payload(email="ours@acme.test", unit_id=str(theirs.id),
                    apps=[{"app": "dms", "role": "dms.manager"}]),
            format="json",
        )

        assert response.status_code == 404
        person.refresh_from_db()
        assert person.unit_id == mine.id

    def test_a_dealer_admin_cannot_pull_somebody_in_from_another_dealership(
        self, client, two_dealers
    ):
        """
        The mirror image, which a check on the TARGET alone would permit.
        """
        result, mine, theirs, admin = two_dealers
        person = add_person(result.organization, unit=theirs, email="theirs@acme.test")
        client.force_authenticate(user=admin.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id),
            payload(email="theirs@acme.test", unit_id=str(mine.id),
                    apps=[{"app": "dms", "role": "dms.manager"}]),
            format="json",
        )

        assert response.status_code == 404
        person.refresh_from_db()
        assert person.unit_id == theirs.id

    def test_a_dealer_admin_cannot_appoint_an_organisation_admin(self, client, two_dealers):
        """
        The ladder. `admin` standing is organization-wide by definition -- the
        check constraint refuses it with a unit -- so a dealer admin issuing
        one would be promoting a stranger above themselves.
        """
        result, _mine, _theirs, admin = two_dealers
        client.force_authenticate(user=admin.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(role="admin", unit_id=None),
            format="json",
        )

        assert response.status_code == 403
        assert Invitation.objects.filter(email="new@acme.test").count() == 0

    def test_an_organisation_admin_sees_every_dealerships_people(self, client, two_dealers):
        """
        The audited override (C23). Reaching into a dealership's users is not
        the normal path and is still allowed.
        """
        result, mine, theirs, _admin = two_dealers
        add_person(result.organization, unit=mine, email="ours@acme.test")
        add_person(result.organization, unit=theirs, email="theirs@acme.test")
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        emails = {p["email"] for p in response.json()}
        assert {"ours@acme.test", "theirs@acme.test", "owner@acme.test"} <= emails


class TestTenantIsolation:
    def test_another_organizations_people_are_never_listed(self, client):
        mine = found()
        theirs = found(name="Northway", email="owner@northway.test", code="CODE-N")
        add_person(theirs.organization, email="theirs@northway.test")
        client.force_authenticate(user=mine.user)

        response = client.get(LIST_URL.format(slug=mine.organization.slug))

        assert {p["email"] for p in response.json()} == {"owner@acme.test"}

    def test_another_organizations_person_is_404_by_id(self, client):
        mine = found()
        theirs = found(name="Northway", email="owner@northway.test", code="CODE-N")
        person = add_person(theirs.organization, email="theirs@northway.test")
        client.force_authenticate(user=mine.user)

        response = client.delete(
            DETAIL_URL.format(slug=mine.organization.slug, id=person.id)
        )

        assert response.status_code == 404
        assert Membership.objects.filter(pk=person.pk).exists()

    def test_a_malformed_id_is_404_not_400(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.delete(
            DETAIL_URL.format(slug=result.organization.slug, id="not-a-uuid")
        )

        assert response.status_code == 404


class TestInviting:
    def test_an_owner_can_invite_somebody(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug), payload(), format="json"
        )

        assert response.status_code == 201
        assert response.json()["status"] == "invited"
        assert response.json()["email"] == "new@acme.test"
        invitation = Invitation.objects.get(email="new@acme.test")
        assert invitation.token
        assert invitation.invited_by_id == result.user.id

    def test_inviting_creates_no_membership(self, client):
        """
        C51. The person may have no account at all, and acceptance is what
        creates the membership.
        """
        result = found()
        client.force_authenticate(user=result.user)

        client.post(INVITE_URL.format(slug=result.organization.slug), payload(), format="json")

        assert Membership.objects.filter(organization=result.organization).count() == 1
        assert not User.objects.filter(email="new@acme.test").exists()

    def test_an_address_already_invited_is_refused(self, client):
        result = found()
        client.force_authenticate(user=result.user)
        url = INVITE_URL.format(slug=result.organization.slug)
        client.post(url, payload(), format="json")

        response = client.post(url, payload(first_name="Again"), format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "email_taken"

    def test_an_address_already_a_member_is_refused(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(email="owner@acme.test"),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "email_taken"

    def test_the_same_address_may_be_invited_by_a_different_organization(self, client):
        """
        Uniqueness is PER ORGANIZATION. One person may belong to several on one
        account (C1, C27), so a global check would refuse an invitation to
        somebody who already works elsewhere on the platform.
        """
        mine = found()
        theirs = found(name="Northway", email="owner@northway.test", code="CODE-N")
        add_person(theirs.organization, email="shared@example.test")
        client.force_authenticate(user=mine.user)

        response = client.post(
            INVITE_URL.format(slug=mine.organization.slug),
            payload(email="shared@example.test"),
            format="json",
        )

        assert response.status_code == 201

    def test_nobody_can_be_invited_as_owner(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(role="owner"),
            format="json",
        )

        # The serializer refuses it before the service does -- "owner" is not
        # one of the choices. Either way it never reaches the database.
        assert response.status_code in (400, 422)


class TestSubscriptionIsRequired:
    """
    THE OTHER HALF OF C16, which was missing until the owner hit its mirror
    image in the UI.

    A grant says this person may open the app; `AppSubscription` says the
    organisation bought it. `/me` already enforced one direction — a grant left
    on a lapsed subscription opens nothing — while nothing stopped the grant
    being made for an app never bought. The only symptom was a launcher tile
    that never became clickable.
    """

    def test_an_app_the_organisation_never_bought_is_refused(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        # A new organisation subscribes to DMS only (DEFAULT_SUBSCRIBED_APPS).
        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(apps=[{"app": "crm", "role": "crm.member"}]),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "app_not_subscribed"
        assert Invitation.objects.filter(email="new@acme.test").count() == 0

    def test_a_cancelled_subscription_refuses_new_grants(self, client):
        """
        The grant is not revoked when billing lapses — C16 is explicit that a
        stale grant must simply open nothing — but no NEW one may be made.
        """
        result = found()
        AppSubscription.objects.filter(organization=result.organization, app=AppCode.DMS).update(
            status=SubscriptionStatus.CANCELLED
        )
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug), payload(), format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "app_not_subscribed"

    def test_editing_somebody_is_held_to_the_same_rule(self, client):
        """
        Invite and edit go through one check, so this cannot drift — which is
        how the C27 rule came to exist in one dialog and not the other.
        """
        result = found()
        person = add_person(result.organization, email="person@acme.test", role_code=None)
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id),
            payload(email="person@acme.test", apps=[{"app": "crm", "role": "crm.member"}]),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "app_not_subscribed"

    def test_re_granting_a_subscribed_app_is_allowed(self, client):
        """
        THE OWNER'S CASE, from the backend side. C41 lets them drop an app they
        never open; nothing about that may stop them taking it back, and the
        subscription is what says so.
        """
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)
        owner.app_access.all().delete()
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=owner.id),
            payload(
                email="owner@acme.test",
                apps=[{"app": "dms", "role": "dms.group_operations"}],
            ),
            format="json",
        )

        assert response.status_code == 200
        assert [a.app for a in owner.app_access.all()] == ["dms"]


class TestC27DealerScopedGrants:
    def test_a_dealer_scoped_person_cannot_be_given_crm(self, client):
        """
        C27. CRM does no unit filtering and has no column to filter on, so this
        person would see every dealership's customers.

        THE ORGANISATION HAS TO SUBSCRIBE TO CRM for this test to mean
        anything. A new one gets DMS only, so without this the request is
        refused for not being bought and C27 is never reached — the test would
        pass for the wrong reason, which is how it started failing when the
        subscription check landed.
        """
        result = found()
        AppSubscription.objects.create(
            organization=result.organization,
            app=AppCode.CRM,
            status=SubscriptionStatus.ACTIVE,
        )
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(
                unit_id=str(unit.id),
                apps=[
                    {"app": "dms", "role": "dms.manager"},
                    {"app": "crm", "role": "crm.member"},
                ],
            ),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "dealer_scoped_app"
        assert Invitation.objects.filter(email="new@acme.test").count() == 0

    def test_a_dealer_scoped_person_cannot_hold_an_org_level_role(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(
                unit_id=str(unit.id),
                apps=[{"app": "dms", "role": "dms.group_operations"}],
            ),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "role_scope_mismatch"

    def test_an_organisation_wide_person_cannot_hold_a_dealership_role(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(apps=[{"app": "dms", "role": "dms.manager"}]),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "role_scope_mismatch"

    def test_administration_cannot_be_granted_as_an_app(self, client):
        """
        C40, C44. It is never an `AppAccess` row and comes from standing or
        from a role granting `admin.*`. Refused rather than dropped, so a
        caller cannot believe it was granted.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug),
            payload(apps=[{"app": "admin", "role": "whatever"}]),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "administration_not_grantable"


class TestEditing:
    def test_an_owner_can_change_somebodys_name_and_role(self, client):
        result = found()
        person = add_person(result.organization, email="person@acme.test", role_code=None)
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id),
            payload(first_name="Renamed", email="person@acme.test"),
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["first_name"] == "Renamed"
        person.refresh_from_db()
        assert person.user.first_name == "Renamed"
        assert person.app_access.count() == 1

    def test_a_members_sign_in_address_cannot_be_changed(self, client):
        """
        C25. An accepted address is how they sign in, so changing it from an
        admin screen is an account takeover with extra steps.
        """
        result = found()
        person = add_person(result.organization, email="person@acme.test", role_code=None)
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id),
            payload(email="somebody-else@acme.test"),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "sign_in_address_locked"
        person.user.refresh_from_db()
        assert person.user.email == "person@acme.test"

    def test_a_pending_persons_address_may_still_be_corrected(self, client):
        """
        The other half of C25, and the reason the rule is about state rather
        than about the field: nobody signs in with it yet.
        """
        result = found()
        invitation = add_invitation(
            result.organization, email="typo@acme.test", role_code=None
        )
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=invitation.id),
            payload(email="correct@acme.test"),
            format="json",
        )

        assert response.status_code == 200
        invitation.refresh_from_db()
        assert invitation.email == "correct@acme.test"

    def test_an_owners_standing_survives_whatever_is_sent(self, client):
        """
        The form never offers "owner", so a payload saying `member` is a stale
        screen rather than an instruction. Taking it would demote the owner and
        leave the owner marker disagreeing with the role, which the check
        constraint refuses outright.
        """
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=owner.id),
            payload(email="owner@acme.test", role="member"),
            format="json",
        )

        assert response.status_code == 200
        owner.refresh_from_db()
        assert owner.role == MembershipRole.OWNER

    def test_removing_an_app_takes_the_grant_away(self, client):
        result = found()
        person = add_person(result.organization, email="person@acme.test")
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id),
            payload(email="person@acme.test", apps=[]),
            format="json",
        )

        assert response.status_code == 200
        assert person.app_access.count() == 0


class TestRemoving:
    def test_removing_somebody_deletes_the_membership_and_keeps_the_account(self, client):
        """
        C24. Their account may belong to other organizations, and their name
        has to stay on what they did here.
        """
        result = found()
        person = add_person(result.organization, email="person@acme.test")
        client.force_authenticate(user=result.user)

        response = client.delete(
            DETAIL_URL.format(slug=result.organization.slug, id=person.id)
        )

        assert response.status_code == 204
        assert not Membership.objects.filter(pk=person.pk).exists()
        assert User.objects.filter(email="person@acme.test").exists()

    def test_removing_a_pending_person_cancels_the_invitation(self, client):
        result = found()
        invitation = add_invitation(result.organization, email="pending@acme.test")
        client.force_authenticate(user=result.user)

        response = client.delete(
            DETAIL_URL.format(slug=result.organization.slug, id=invitation.id)
        )

        assert response.status_code == 204
        assert not Invitation.objects.filter(pk=invitation.pk).exists()

    def test_the_owner_cannot_be_removed(self, client):
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)
        client.force_authenticate(user=result.user)

        response = client.delete(
            DETAIL_URL.format(slug=result.organization.slug, id=owner.id)
        )

        assert response.status_code == 409
        assert response.json()["code"] == "owner_protected"
        assert Membership.objects.filter(pk=owner.pk).exists()


class TestStatus:
    def test_somebody_can_be_switched_off_and_back_on(self, client):
        result = found()
        person = add_person(result.organization, email="person@acme.test")
        client.force_authenticate(user=result.user)
        url = ACTION_URL.format(slug=result.organization.slug, id=person.id, action="deactivate")

        off = client.post(url)
        assert off.status_code == 200
        assert off.json()["status"] == "disabled"

        on = client.post(
            ACTION_URL.format(slug=result.organization.slug, id=person.id, action="activate")
        )
        assert on.status_code == 200
        assert on.json()["status"] == "active"

    def test_the_owner_cannot_be_switched_off(self, client):
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)
        client.force_authenticate(user=result.user)

        response = client.post(
            ACTION_URL.format(slug=result.organization.slug, id=owner.id, action="deactivate")
        )

        assert response.status_code == 409
        assert response.json()["code"] == "owner_protected"

    def test_a_pending_person_cannot_be_switched_off(self, client):
        """
        There is nothing to disable about an invitation. C51 is what makes this
        clean: pending people are not memberships, so there is no `status` to
        misuse.
        """
        result = found()
        invitation = add_invitation(result.organization, email="pending@acme.test")
        client.force_authenticate(user=result.user)

        response = client.post(
            ACTION_URL.format(slug=result.organization.slug, id=invitation.id,
                              action="deactivate")
        )

        assert response.status_code == 409
        assert response.json()["code"] == "not_an_invitation"

    def test_an_unknown_action_is_404_rather_than_a_deactivation(self, client):
        """
        THE ROUTE IS GENERIC AND THE VIEW IS WHAT MAKES IT NOT EXIST. A bare
        `else` would turn every unrecognised verb into "deactivate", so a typo
        in a URL would switch somebody off.
        """
        result = found()
        person = add_person(result.organization, email="person@acme.test")
        client.force_authenticate(user=result.user)

        response = client.post(
            ACTION_URL.format(slug=result.organization.slug, id=person.id, action="promote")
        )

        assert response.status_code == 404
        person.refresh_from_db()
        assert person.status == MembershipStatus.ACTIVE


class TestResendingAnInvitation:
    def test_it_mints_a_new_token_and_the_old_one_stops_working(self, client):
        """
        A NEW TOKEN, not the old one sent twice -- so an invitation forwarded
        to the wrong person cannot still be accepted afterwards.
        """
        result = found()
        invitation = add_invitation(result.organization, email="pending@acme.test")
        original = invitation.token
        client.force_authenticate(user=result.user)

        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/admin/users/{invitation.id}"
            f"/resend-invitation/"
        )

        assert response.status_code == 204
        invitation.refresh_from_db()
        assert invitation.token != original

    def test_it_refuses_somebody_who_has_already_accepted(self, client):
        result = found()
        person = add_person(result.organization, email="person@acme.test")
        client.force_authenticate(user=result.user)

        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/admin/users/{person.id}"
            f"/resend-invitation/"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "not_an_invitation"


class TestTheInvitationWindow:
    """
    SEVEN DAYS (C62, answering Q40), AND THE NUMBER IS WHAT IS PINNED.

    It was 14 while the token was still going to be emailed. C56 put the link
    in a chat message instead -- backed up, searchable, forwardable -- so how
    long a leaked one keeps working is the whole of the exposure.

    NOTHING PINNED THIS BEFORE. Both callers derive their `expires_at` from
    `INVITATION_LIFETIME`, and the invitation fixtures elsewhere in this file
    pick their own expiry, so the constant could have been edited to any value
    and all 327 tests would still have passed. A test written against the
    constant would be the same cannot-fail check -- so this asserts the number.
    """

    def test_the_lifetime_is_seven_days(self):
        assert INVITATION_LIFETIME == timezone.timedelta(days=7)

    def test_inviting_sets_the_expiry_seven_days_out(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        client.post(INVITE_URL.format(slug=result.organization.slug), payload(), format="json")

        invitation = Invitation.objects.get(email="new@acme.test")
        expected = timezone.now() + timezone.timedelta(days=7)
        assert abs((invitation.expires_at - expected).total_seconds()) < 60

    def test_resending_restarts_the_window_from_now(self, client):
        """
        FROM NOW, NOT FROM THE ORIGINAL EXPIRY. Resend exists so somebody who
        missed the window gets a fresh one; extending the old date would hand
        a person invited eight days ago a link already dead on arrival.
        """
        result = found()
        invitation = add_invitation(result.organization, email="pending@acme.test")
        invitation.expires_at = timezone.now() + timezone.timedelta(hours=1)
        invitation.save(update_fields=["expires_at"])
        client.force_authenticate(user=result.user)

        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/admin/users/{invitation.id}"
            f"/resend-invitation/"
        )

        assert response.status_code == 204
        invitation.refresh_from_db()
        expected = timezone.now() + timezone.timedelta(days=7)
        assert abs((invitation.expires_at - expected).total_seconds()) < 60


class TestCapabilityRefusals:
    """403, not 404 --- the caller is openly a member and may not do this."""

    def test_a_salesperson_cannot_read_the_users_list(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        person = add_person(result.organization, unit=unit, email="sales@acme.test")
        client.force_authenticate(user=person.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.status_code == 403
        assert response.json()["code"] == "not_permitted"

    def test_a_salesperson_cannot_invite_anybody(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        person = add_person(result.organization, unit=unit, email="sales@acme.test")
        client.force_authenticate(user=person.user)

        response = client.post(
            INVITE_URL.format(slug=result.organization.slug), payload(), format="json"
        )

        assert response.status_code == 403
        assert Invitation.objects.count() == 0
