"""
`GET /api/v1/orgs/<slug>/dms/settings/users/` -- DMS settings -> Users & Roles
-> Users (the owner, 2026-11-23; C78 amended).

Everybody who holds DMS: the owner first and always, then members with a DMS
grant (active or inactive), then invitations carrying one (pending). Gated on
`dms.user.view`, which no role holds, so the owner alone gets in for now.
"""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    GrantStatus,
    Invitation,
    Membership,
    MembershipAppAccess,
    MembershipStatus,
    Territory,
    TerritoryKind,
)
from core.organizations.services import accept_invitation, grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

URL = "/api/v1/orgs/{slug}/dms/settings/users/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    # Signup subscribes DMS and gives the owner a DMS grant.
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def dealer(result, name="Delhi East"):
    return Territory.objects.create(
        organization=result.organization, kind=TerritoryKind.DEALER, name=name
    )


def root(result, app=AppCode.DMS):
    return Territory.objects.root_for(result.organization, app)


def member(
    result, *, email, app=AppCode.DMS, role_code="dms.manager", place=None, first="", last=""
):
    user = User.objects.create_user(email=email, password="x", first_name=first, last_name=last)
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=app,
        role=Role.objects.get(code=role_code),
        territories=[place or dealer(result, name=f"Dealer of {email}")],
    )
    return membership


def invite(result, *, email, app=AppCode.DMS, role_code="dms.manager"):
    invitation = Invitation.objects.create(
        organization=result.organization,
        email=email,
        first_name="Pending",
        last_name="Person",
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )
    invitation.app_grants.create(app_id=app, role=Role.objects.get(code=role_code))
    return invitation


def listing(client, result, user=None):
    client.force_authenticate(user=user or result.user)
    response = client.get(URL.format(slug=result.organization.slug))
    assert response.status_code == 200, response.content
    return response.json()


class TestTheList:
    def test_the_owner_alone_in_a_new_organisation(self, client):
        result = found()

        body = listing(client, result)

        assert len(body) == 1
        owner = body[0]
        assert owner["email"] == "owner@acme.test"
        assert owner["is_owner"] is True
        # Every app has the owner by default; no role or place is theirs to show.
        assert owner["role"] is None
        assert owner["territories"] == []
        assert owner["status"] == "active"

    def test_the_fields_are_exactly_what_api_ts_declares(self, client):
        result = found()

        body = listing(client, result)

        assert set(body[0]) == {
            "id",
            "first_name",
            "last_name",
            "email",
            "is_owner",
            "role",
            "territories",
            "places",
            "status",
            "access_status",
        }

    def test_the_owner_first_then_people_in_the_order_they_arrived(self, client):
        result = found()
        member(result, email="zed@acme.test")
        member(result, email="amy@acme.test")
        invite(result, email="new@acme.test")

        emails = [row["email"] for row in listing(client, result)]

        assert emails == ["owner@acme.test", "zed@acme.test", "amy@acme.test", "new@acme.test"]

    def test_a_member_carries_their_dms_role_and_places(self, client):
        result = found()
        place = dealer(result, name="Chennai")
        member(
            result,
            email="nish@acme.test",
            role_code="dms.sales_representative",
            place=place,
            first="Nishanth",
            last="K",
        )

        nish = listing(client, result)[1]

        assert (nish["first_name"], nish["last_name"]) == ("Nishanth", "K")
        assert nish["is_owner"] is False
        assert nish["role"] == {"code": "dms.sales_representative", "name": "Sales representative"}
        assert nish["territories"] == ["Chennai"]
        assert nish["status"] == "active"


class TestWhoIsListed:
    def test_only_people_who_hold_dms(self, client):
        result = found()
        member(result, email="dms@acme.test")
        # A person with CRM only, and a pending person with CRM only.
        member(
            result,
            email="crm@acme.test",
            app=AppCode.CRM,
            role_code="crm.member",
            place=root(result, AppCode.CRM),
        )
        invite(result, email="crm-invite@acme.test", app=AppCode.CRM, role_code="crm.member")

        emails = [row["email"] for row in listing(client, result)]

        assert emails == ["owner@acme.test", "dms@acme.test"]

    def test_disabled_dms_access_is_inactive(self, client):
        result = found()
        person = member(result, email="off@acme.test")
        MembershipAppAccess.objects.filter(membership=person, app=AppCode.DMS).update(
            status=GrantStatus.DISABLED
        )

        assert listing(client, result)[1]["status"] == "inactive"

    def test_a_deactivated_account_is_inactive(self, client):
        result = found()
        person = member(result, email="gone@acme.test")
        person.status = MembershipStatus.DISABLED
        person.save()

        assert listing(client, result)[1]["status"] == "inactive"

    def test_an_invitation_carrying_dms_is_pending_with_its_role_and_no_place(self, client):
        result = found()
        invite(result, email="soon@acme.test", role_code="dms.technician")

        soon = listing(client, result)[1]

        assert soon["status"] == "pending"
        assert soon["role"] == {"code": "dms.technician", "name": "Technician"}
        assert soon["territories"] == []

    def test_an_accepted_invitation_is_not_listed_twice(self, client):
        result = found()
        invitation = invite(result, email="joined@acme.test")
        invitation.accepted_at = timezone.now()
        invitation.save()

        emails = [row["email"] for row in listing(client, result)]

        assert "joined@acme.test" not in emails

    def test_never_another_organisations_people(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        member(theirs, email="theirs@other.test")
        invite(theirs, email="their-invite@other.test")

        emails = [row["email"] for row in listing(client, ours)]

        assert emails == ["owner@acme.test"]


class TestWhoMayAsk:
    """
    THE OWNER ALONE, for now (Q63): `dms.user.view` is held by no role. Each
    case below is somebody who might reasonably have expected to get in.
    """

    def test_no_role_holds_the_permission(self):
        assert not Role.objects.filter(permissions__code="dms.user.view").exists()

    def test_an_organisation_admin_is_refused(self, client):
        result = found()
        admin = member(
            result,
            email="admin@acme.test",
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            place=root(result, AppCode.ADMIN),
        )

        client.force_authenticate(user=admin.user)
        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    @pytest.mark.parametrize(
        "role_code",
        ["dms.system_admin", "dms.manager", "dms.sales_representative"],
    )
    def test_a_dealership_role_is_refused(self, client, role_code):
        result = found()
        person = member(result, email="dealer@acme.test", role_code=role_code)

        client.force_authenticate(user=person.user)
        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    @pytest.mark.parametrize("role_code", ["dms.group_operations", "dms.fleet_viewer"])
    def test_an_organisation_level_dms_role_is_refused(self, client, role_code):
        result = found()
        person = member(result, email="hq@acme.test", role_code=role_code, place=root(result))

        client.force_authenticate(user=person.user)
        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    def test_another_organisations_owner_gets_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")

        client.force_authenticate(user=theirs.user)
        response = client.get(URL.format(slug=ours.organization.slug))

        assert response.status_code == 404

    def test_signed_out_is_401(self, client):
        result = found()

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 401


ROLES_URL = "/api/v1/orgs/{slug}/dms/settings/invite-roles/"


def post_invite(client, result, body, user=None):
    client.force_authenticate(user=user or result.user)
    return client.post(URL.format(slug=result.organization.slug), body, format="json")


def an_invite(**overrides):
    return {
        "first_name": "Priya",
        "last_name": "M",
        "email": "priya@acme.test",
        "role": "dms.group_operations",
        **overrides,
    }


class TestInviteUser:
    """
    Invite User (the owner, 2026-11-24): a person and their DMS role. They get
    DMS because they are invited from it; the role is DMS's and organisation-
    level, since an invitation is placed at the root when accepted (C83).
    """

    def test_creates_a_pending_person_holding_dms(self, client):
        result = found()

        response = post_invite(client, result, an_invite())

        assert response.status_code == 201, response.content
        row = response.json()
        assert row["email"] == "priya@acme.test"
        assert (row["first_name"], row["last_name"]) == ("Priya", "M")
        assert row["status"] == "pending"
        assert row["role"] == {"code": "dms.group_operations", "name": "Group operations"}
        assert row["territories"] == []

        invitation = Invitation.objects.get(email="priya@acme.test")
        assert list(invitation.app_grants.values_list("app_id", "role__code")) == [
            (AppCode.DMS, "dms.group_operations")
        ]
        assert not Membership.objects.filter(user__email="priya@acme.test").exists()

    def test_the_new_row_is_the_lists_own(self, client):
        result = found()

        row = post_invite(client, result, an_invite()).json()

        assert listing(client, result)[1] == row

    def test_accepting_joins_dms_with_that_role_and_no_place(self, client):
        result = found()
        post_invite(client, result, an_invite(role="dms.fleet_viewer"))
        invitation = Invitation.objects.get(email="priya@acme.test")

        accept_invitation(token=invitation.token, password="correct horse battery staple")

        joined = Membership.objects.get(user__email="priya@acme.test")
        grant = joined.grants.get(app_id=AppCode.DMS)
        assert grant.roles.get().role.code == "dms.fleet_viewer"
        # NO TERRITORY UNTIL ONE IS ASSIGNED (the owner, 2026-11-24).
        assert not grant.territories.exists()

    @pytest.mark.parametrize(
        "role",
        [
            "crm.member",  # another app's role
            "admin.org_admin",  # the Admin panel's
            "dms.no_such_role",
        ],
    )
    def test_refuses_a_role_it_cannot_give_and_leaves_nothing_behind(self, client, role):
        result = found()

        response = post_invite(client, result, an_invite(role=role))

        assert response.status_code == 409, response.content
        # One transaction: the person is not left invited with no app.
        assert not Invitation.objects.filter(email="priya@acme.test").exists()

    def test_refuses_an_address_already_in_the_organisation(self, client):
        result = found()

        response = post_invite(client, result, an_invite(email="owner@acme.test"))

        assert response.status_code == 409

    @pytest.mark.parametrize("field", ["app", "unit_id", "territories"])
    def test_refuses_fields_it_does_not_take(self, client, field):
        result = found()

        response = post_invite(client, result, {**an_invite(), field: "x"})

        assert response.status_code == 422
        assert not Invitation.objects.exists()

    def test_needs_a_first_name_an_email_and_a_role(self, client):
        result = found()

        response = post_invite(client, result, {"last_name": "M"})

        assert response.status_code == 422
        fields = {error["field"] for error in response.json()["errors"]}
        assert {"first_name", "email", "role"} <= fields

    def test_no_role_holds_the_permission(self):
        assert not Role.objects.filter(permissions__code="dms.user.create").exists()

    def test_an_organisation_admin_is_refused(self, client):
        result = found()
        admin = member(
            result,
            email="admin@acme.test",
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            place=root(result, AppCode.ADMIN),
        )

        response = post_invite(client, result, an_invite(), user=admin.user)

        assert response.status_code == 403
        assert not Invitation.objects.exists()

    @pytest.mark.parametrize("role_code", ["dms.system_admin", "dms.manager"])
    def test_a_dealership_role_is_refused(self, client, role_code):
        result = found()
        person = member(result, email="dealer@acme.test", role_code=role_code)

        response = post_invite(client, result, an_invite(), user=person.user)

        assert response.status_code == 403


class TestTheRolesItOffers:
    def test_every_dms_role(self, client):
        """ONLY APP ROLES (the owner, 2026-11-24): no organisation / dealership level."""
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        codes = {role["code"] for role in response.json()}
        assert codes == set(
            Role.objects.filter(app_id=AppCode.DMS, organization_id__isnull=True).values_list(
                "code", flat=True
            )
        )
        assert {"dms.group_operations", "dms.manager", "dms.technician"} <= codes
        assert set(response.json()[0]) == {"code", "name", "summary"}

    def test_an_organisation_admin_is_refused(self, client):
        result = found()
        admin = member(
            result,
            email="admin@acme.test",
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            place=root(result, AppCode.ADMIN),
        )
        client.force_authenticate(user=admin.user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        assert response.status_code == 403


class TestInvitingIsItsOwnPermission:
    """
    Seeing the list is not inviting (C81: a view that reads and writes names its
    write). Nobody holds either permission today, so a role is made here that
    holds only the list's -- the shape an app admin who may look but not invite
    would have.
    """

    def test_seeing_the_list_does_not_let_you_invite(self, client):
        result = found()
        looker = Role.objects.create(
            code="dms.looker",
            name="Looker",
            app_id=AppCode.DMS,
            level="org",
            summary="Sees DMS's users.",
            organization_id=result.organization.pk,
        )
        RolePermission.objects.create(
            role=looker, permission=Permission.objects.get(code="dms.user.view")
        )
        person = member(
            result, email="looker@acme.test", role_code="dms.looker", place=root(result)
        )

        client.force_authenticate(user=person.user)
        slug = result.organization.slug
        assert client.get(URL.format(slug=slug)).status_code == 200
        assert client.get(ROLES_URL.format(slug=slug)).status_code == 403

        response = post_invite(client, result, an_invite(), user=person.user)

        assert response.status_code == 403
        assert not Invitation.objects.exists()


# --- A row's Edit, Deactivate and Delete (the owner, 2026-11-24) ------------------
#
# ALL ON THE PERSON'S DMS, not their account: Edit = details + DMS role,
# Deactivate = DMS off (the app tile's Disable), Delete = DMS taken away.


def person_url(result, person_id, rest=""):
    return f"/api/v1/orgs/{result.organization.slug}/dms/settings/users/{person_id}/{rest}"


def an_edit(**overrides):
    return {
        "first_name": "Nish",
        "last_name": "Kumar",
        "email": "nish@acme.test",
        "role": "dms.technician",
        **overrides,
    }


def as_owner(client, result):
    client.force_authenticate(user=result.user)
    return client


class TestEdit:
    def test_a_member_s_names_and_dms_role_change_and_their_place_stays(self, client):
        result = found()
        place = dealer(result, name="Chennai")
        person = member(result, email="nish@acme.test", role_code="dms.manager", place=place)

        response = as_owner(client, result).put(
            person_url(result, person.pk), an_edit(), format="json"
        )

        assert response.status_code == 200, response.content
        row = response.json()
        assert (row["first_name"], row["last_name"]) == ("Nish", "Kumar")
        assert row["role"] == {"code": "dms.technician", "name": "Technician"}
        assert row["territories"] == ["Chennai"]

    def test_a_member_s_sign_in_address_cannot_change_and_nothing_is_saved(self, client):
        result = found()
        person = member(result, email="nish@acme.test", role_code="dms.manager")

        response = as_owner(client, result).put(
            person_url(result, person.pk), an_edit(email="other@acme.test"), format="json"
        )

        assert response.status_code == 409
        person.user.refresh_from_db()
        assert person.user.first_name == ""  # the name was not saved either: one transaction

    def test_a_pending_person_s_address_and_role_can_change(self, client):
        result = found()
        invitation = invite(result, email="soon@acme.test", role_code="dms.group_operations")

        response = as_owner(client, result).put(
            person_url(result, invitation.pk),
            an_edit(email="later@acme.test", role="dms.fleet_viewer"),
            format="json",
        )

        assert response.status_code == 200, response.content
        assert response.json()["email"] == "later@acme.test"
        assert response.json()["role"]["code"] == "dms.fleet_viewer"

    def test_any_dms_role_fits_their_place(self, client):
        """ONLY APP ROLES (the owner, 2026-11-24): once refused at a dealership."""
        result = found()
        person = member(result, email="nish@acme.test", role_code="dms.manager")

        response = as_owner(client, result).put(
            person_url(result, person.pk), an_edit(role="dms.group_operations"), format="json"
        )

        assert response.status_code == 200, response.content
        assert response.json()["role"]["code"] == "dms.group_operations"

    def test_an_unknown_role_is_refused_and_nothing_is_saved(self, client):
        result = found()
        person = member(result, email="nish@acme.test", role_code="dms.manager")

        response = as_owner(client, result).put(
            person_url(result, person.pk), an_edit(role="dms.no_such_role"), format="json"
        )

        assert response.status_code == 409
        person.user.refresh_from_db()
        assert person.user.first_name == ""

    def test_never_the_owner(self, client):
        result = found()
        owner = Membership.objects.get(organization=result.organization, is_owner=True)

        response = as_owner(client, result).put(
            person_url(result, owner.pk), an_edit(email="owner@acme.test"), format="json"
        )

        assert response.status_code == 409

    def test_somebody_without_dms_is_not_found(self, client):
        result = found()
        person = member(
            result,
            email="crm@acme.test",
            app=AppCode.CRM,
            role_code="crm.member",
            place=root(result, AppCode.CRM),
        )

        response = as_owner(client, result).put(
            person_url(result, person.pk), an_edit(email="crm@acme.test"), format="json"
        )

        assert response.status_code == 404

    def test_refuses_fields_it_does_not_take(self, client):
        result = found()
        person = member(result, email="nish@acme.test")

        response = as_owner(client, result).put(
            person_url(result, person.pk), {**an_edit(), "territories": ["x"]}, format="json"
        )

        assert response.status_code == 422


class TestTheRolesEditOffers:
    def test_everybody_is_offered_every_dms_role_wherever_they_are(self, client):
        """ONLY APP ROLES (the owner, 2026-11-24): the place no longer narrows it."""
        result = found()
        at_dealer = member(result, email="nish@acme.test", role_code="dms.manager")
        at_root = member(
            result, email="hq@acme.test", role_code="dms.fleet_viewer", place=root(result)
        )
        pending = invite(result, email="soon@acme.test", role_code="dms.group_operations")
        owner_client = as_owner(client, result)
        every = set(
            Role.objects.filter(app_id=AppCode.DMS, organization_id__isnull=True).values_list(
                "code", flat=True
            )
        )

        for person_id in (at_dealer.pk, at_root.pk, pending.pk):
            response = owner_client.get(person_url(result, person_id, "roles/"))
            assert response.status_code == 200
            assert {role["code"] for role in response.json()} == every

    def test_the_owner_another_org_s_person_and_nonsense_are_not_found(self, client):
        result = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        their_person = member(theirs, email="theirs@other.test")
        owner = Membership.objects.get(organization=result.organization, is_owner=True)
        owner_client = as_owner(client, result)

        for person_id in (owner.pk, their_person.pk, "not-a-uuid"):
            response = owner_client.get(person_url(result, person_id, "roles/"))
            assert response.status_code == 404, person_id


class TestDeactivate:
    def test_switches_their_dms_off_and_back_on_keeping_role_and_place(self, client):
        result = found()
        place = dealer(result, name="Chennai")
        person = member(result, email="nish@acme.test", role_code="dms.manager", place=place)
        owner_client = as_owner(client, result)

        off = owner_client.post(person_url(result, person.pk, "deactivate/")).json()
        assert (off["status"], off["access_status"]) == ("inactive", "disabled")
        assert off["role"]["code"] == "dms.manager"
        assert off["territories"] == ["Chennai"]
        # Their ACCOUNT is untouched: only DMS is off.
        person.refresh_from_db()
        assert person.status == MembershipStatus.ACTIVE

        on = owner_client.post(person_url(result, person.pk, "activate/")).json()
        assert (on["status"], on["access_status"]) == ("active", "active")

    def test_a_pending_person_has_nothing_to_switch_off(self, client):
        result = found()
        invitation = invite(result, email="soon@acme.test", role_code="dms.group_operations")

        response = as_owner(client, result).post(person_url(result, invitation.pk, "deactivate/"))

        assert response.status_code == 409

    def test_never_the_owner(self, client):
        result = found()
        owner = Membership.objects.get(organization=result.organization, is_owner=True)

        response = as_owner(client, result).post(person_url(result, owner.pk, "deactivate/"))

        assert response.status_code == 409

    def test_an_unknown_action_is_not_found(self, client):
        result = found()
        person = member(result, email="nish@acme.test")

        response = as_owner(client, result).post(person_url(result, person.pk, "explode/"))

        assert response.status_code == 404


class TestDelete:
    def test_takes_dms_away_and_they_stay_in_the_organisation(self, client):
        result = found()
        person = member(result, email="nish@acme.test")

        response = as_owner(client, result).delete(person_url(result, person.pk))

        assert response.status_code == 204
        assert Membership.objects.filter(pk=person.pk).exists()
        assert not MembershipAppAccess.objects.filter(membership=person, app=AppCode.DMS).exists()
        assert "nish@acme.test" not in [row["email"] for row in listing(client, result)]

    def test_their_other_apps_stay(self, client):
        result = found()
        person = member(
            result, email="hq@acme.test", role_code="dms.fleet_viewer", place=root(result)
        )
        grant_app_access(
            membership=person,
            app=AppCode.CRM,
            role=Role.objects.get(code="crm.member"),
            territories=[root(result, AppCode.CRM)],
        )

        as_owner(client, result).delete(person_url(result, person.pk))

        assert list(person.grants.values_list("app_id", flat=True)) == [AppCode.CRM]

    def test_a_pending_person_holding_only_dms_is_cancelled(self, client):
        result = found()
        invitation = invite(result, email="soon@acme.test", role_code="dms.group_operations")

        response = as_owner(client, result).delete(person_url(result, invitation.pk))

        assert response.status_code == 204
        assert not Invitation.objects.filter(pk=invitation.pk).exists()

    def test_a_pending_person_holding_another_app_keeps_their_invitation(self, client):
        result = found()
        invitation = invite(result, email="soon@acme.test", role_code="dms.group_operations")
        invitation.app_grants.create(app_id=AppCode.CRM, role=Role.objects.get(code="crm.member"))

        as_owner(client, result).delete(person_url(result, invitation.pk))

        invitation.refresh_from_db()
        assert list(invitation.app_grants.values_list("app_id", flat=True)) == [AppCode.CRM]

    def test_never_the_owner(self, client):
        result = found()
        owner = Membership.objects.get(organization=result.organization, is_owner=True)

        response = as_owner(client, result).delete(person_url(result, owner.pk))

        assert response.status_code == 409
        assert MembershipAppAccess.objects.filter(membership=owner, app=AppCode.DMS).exists()


class TestEachActIsItsOwnPermission:
    """
    Nobody but the owner holds these today, so a role is made that may SEE the
    list and nothing else -- each act must still be refused, by its own
    permission rather than borrowing the list's.
    """

    @pytest.fixture
    def looker(self, client):
        result = found()
        role = Role.objects.create(
            code="dms.looker",
            name="Looker",
            app_id=AppCode.DMS,
            level="org",
            summary="Sees DMS's users.",
            organization_id=result.organization.pk,
        )
        RolePermission.objects.create(
            role=role, permission=Permission.objects.get(code="dms.user.view")
        )
        person = member(
            result, email="looker@acme.test", role_code="dms.looker", place=root(result)
        )
        target = member(result, email="nish@acme.test")
        client.force_authenticate(user=person.user)
        return result, target

    def test_edit(self, client, looker):
        result, target = looker
        assert (
            client.put(person_url(result, target.pk), an_edit(), format="json").status_code == 403
        )
        assert client.get(person_url(result, target.pk, "roles/")).status_code == 403

    def test_deactivate(self, client, looker):
        result, target = looker
        assert client.post(person_url(result, target.pk, "deactivate/")).status_code == 403

    def test_delete(self, client, looker):
        result, target = looker
        assert client.delete(person_url(result, target.pk)).status_code == 403
        assert MembershipAppAccess.objects.filter(membership=target, app=AppCode.DMS).exists()

    def test_an_organisation_admin_is_refused_every_act(self, client):
        result = found()
        admin = member(
            result,
            email="admin@acme.test",
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            place=root(result, AppCode.ADMIN),
        )
        target = member(result, email="nish@acme.test")
        client.force_authenticate(user=admin.user)

        assert (
            client.put(person_url(result, target.pk), an_edit(), format="json").status_code == 403
        )
        assert client.post(person_url(result, target.pk, "deactivate/")).status_code == 403
        assert client.delete(person_url(result, target.pk)).status_code == 403
