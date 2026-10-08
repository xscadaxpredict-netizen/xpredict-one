"""
Redeeming an invitation link, and handing that link to an admin (C56).

WHAT THIS FLOW REPLACES. There is no email transport: the admin copies a link
and sends it however they already talk to the person. So the token in the link
IS the credential, and the tests that matter are the ones about what it can and
cannot be used for -- clicked twice, clicked late, clicked by the wrong
account, clicked after the organisation stopped paying for the app it grants.

FOUR REFUSAL SHAPES, and mixing them up is the bug:

- An unknown token -> 404. There is nothing to say about an invitation nobody
  holds, and a different answer would let somebody probe for live tokens.
- Expired or already accepted -> 409, with a `code` the screen switches on,
  because both are states the holder can get out of.
- An address that already has an account -> 409 `invitation_needs_sign_in`.
  Setting a password through a link would be a password reset with no proof of
  who is holding it.
- Signed in as somebody else -> 409 `invitation_wrong_account`. The innocent
  case is an admin pasting the link to check it, and accepting on their own
  account would add the wrong person and spend the invitation.
"""

from __future__ import annotations

import pytest
from django.core.exceptions import ImproperlyConfigured
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
from core.organizations.services import accept_invitation, invitation_link, sign_up
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

PREVIEW_URL = "/api/v1/invitations/{token}/"
ACCEPT_URL = "/api/v1/invitations/{token}/accept/"
LINK_URL = "/api/v1/orgs/{slug}/admin/users/{id}/invite-link/"

PASSWORD = "correct horse battery staple"
TOKEN = "a-real-looking-token"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Motors", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password=PASSWORD,
    )


def dms_role(code):
    return Role.objects.get(app=AppCode.DMS, code=code)


# THE ROLE HAS TO MATCH THE SCOPE, and accepting is where that gets checked
# again. A dealership role on an organisation-wide invitation raises
# `RoleScopeMismatchError` (C32, C33) -- which these fixtures learned the hard
# way, because creating the rows directly (as `test_users_api.py` does) never
# runs the rule and a mismatched pair looks fine until something validates it.
ORG_ROLE = "dms.group_operations"
UNIT_ROLE = "dms.sales_representative"


def invite(
    organization,
    *,
    email="pending@acme.test",
    unit=None,
    role=MembershipRole.MEMBER,
    role_code="",
    token=TOKEN,
    expires_in_days=14,
    invited_by=None,
):
    """`role_code=""` means "whichever role fits the scope"; None means no app."""
    if role_code == "":
        role_code = UNIT_ROLE if unit is not None else ORG_ROLE
    invitation = Invitation.objects.create(
        organization=organization,
        unit=unit,
        email=email,
        first_name="Pending",
        last_name="Person",
        role=role,
        token=token,
        expires_at=timezone.now() + timezone.timedelta(days=expires_in_days),
        invited_by=invited_by,
    )
    if role_code:
        invitation.app_grants.create(app=AppCode.DMS, role=dms_role(role_code))
    return invitation


class TestThePreview:
    def test_it_names_the_organisation_and_the_address(self, client):
        """
        Nobody should type a password into "join an organisation" with no name
        on it, and the address is what tells the holder the link is theirs.
        """
        result = found()
        invite(result.organization, invited_by=result.user)

        response = client.get(PREVIEW_URL.format(token=TOKEN))

        assert response.status_code == 200
        body = response.json()
        assert body["organization_name"] == "Acme Motors"
        assert body["organization_slug"] == result.organization.slug
        assert body["email"] == "pending@acme.test"
        assert body["requires_sign_in"] is False
        assert body["is_expired"] is False
        assert body["is_accepted"] is False
        assert body["invited_by"] == "owner@acme.test"

    def test_the_fields_are_exactly_what_the_frontend_declares(self, client):
        """
        C43 removed the generated client, so this set IS the contract with
        `shell/api/invitations.ts`. A field renamed here goes blank there and
        nothing else says so.
        """
        result = found()
        invite(result.organization)

        response = client.get(PREVIEW_URL.format(token=TOKEN))

        assert set(response.json()) == {
            "organization_name",
            "organization_slug",
            "email",
            "expires_at",
            "is_expired",
            "is_accepted",
            "requires_sign_in",
            "invited_by",
        }

    def test_it_says_nothing_about_the_dealership_the_role_or_the_apps(self, client):
        """
        Unauthenticated, so every field is a disclosure to whoever holds the
        token. None of these help the holder decide whether to accept, and all
        of them are somebody's staffing arrangement.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Chennai North")
        invite(result.organization, unit=unit)

        body = client.get(PREVIEW_URL.format(token=TOKEN)).json()

        assert "unit_name" not in body
        assert "role" not in body
        assert "apps" not in body
        assert "Chennai North" not in str(body)

    def test_an_unknown_token_is_404(self, client):
        found()
        response = client.get(PREVIEW_URL.format(token="not-a-token"))
        assert response.status_code == 404

    def test_it_still_answers_for_an_expired_invitation(self, client):
        """
        "Ask for a new link" and a dead page are different experiences, and
        refusing here would make them the same.
        """
        result = found()
        invite(result.organization, expires_in_days=-1)

        response = client.get(PREVIEW_URL.format(token=TOKEN))

        assert response.status_code == 200
        assert response.json()["is_expired"] is True

    def test_it_says_when_the_address_already_has_an_account(self, client):
        """
        One login spans organisations (C1, C27), so this is the ordinary case
        of inviting somebody who already works somewhere else on the platform.
        The screen asks them to sign in instead of offering a password.
        """
        result = found()
        User.objects.create_user(email="pending@acme.test", password=PASSWORD)
        invite(result.organization)

        body = client.get(PREVIEW_URL.format(token=TOKEN)).json()

        assert body["requires_sign_in"] is True

    def test_reading_it_does_not_depend_on_who_is_asking(self, client):
        """
        An admin checking a link must see what the recipient sees. The view
        has no authentication classes at all, rather than `AllowAny` layered
        on the defaults.
        """
        result = found()
        invite(result.organization)
        client.force_authenticate(user=result.user)

        assert client.get(PREVIEW_URL.format(token=TOKEN)).status_code == 200


class TestAcceptingAsSomebodyNew:
    def test_it_creates_the_account_the_membership_and_the_app_access(self, client):
        result = found()
        invite(result.organization)

        response = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert response.status_code == 201
        assert response.json() == {
            "org_slug": result.organization.slug,
            "account_created": True,
        }

        user = User.objects.get(email="pending@acme.test")
        membership = Membership.objects.get(user=user, organization=result.organization)
        assert membership.status == MembershipStatus.ACTIVE
        assert membership.role == MembershipRole.MEMBER
        assert [a.role.code for a in membership.app_access.all()] == [ORG_ROLE]

    def test_the_name_comes_from_the_invitation(self, client):
        """
        The admin typed it when they invited, so the accept form does not ask
        again -- it asks for the one thing only this person can supply.
        """
        result = found()
        invite(result.organization)

        client.post(ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json")

        user = User.objects.get(email="pending@acme.test")
        assert (user.first_name, user.last_name) == ("Pending", "Person")

    def test_accepting_signs_them_in(self, client):
        """
        C56, matching signup. The alternative is landing somebody on the
        sign-in screen to type the password they chose ten seconds ago.
        """
        result = found()
        invite(result.organization)

        response = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert "xp_access" in response.cookies
        assert response.cookies["xp_access"]["httponly"] is True

    def test_the_dealership_comes_across(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Chennai North")
        invite(result.organization, unit=unit)

        client.post(ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json")

        membership = Membership.objects.get(user__email="pending@acme.test")
        assert membership.unit_id == unit.id

    def test_the_new_member_is_not_an_owner(self, client):
        """
        An owner is founded with the organisation and never invited into one
        (C41). `owner_marker` must stay NULL or the one-owner-per-org
        constraint is the thing that notices.
        """
        result = found()
        invite(result.organization, role=MembershipRole.ADMIN)

        client.post(ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json")

        membership = Membership.objects.get(user__email="pending@acme.test")
        assert membership.role == MembershipRole.ADMIN
        assert membership.owner_marker is None
        assert (
            Membership.objects.filter(
                organization=result.organization, role=MembershipRole.OWNER
            ).count()
            == 1
        )

    def test_a_password_is_required(self, client):
        result = found()
        invite(result.organization)

        response = client.post(ACCEPT_URL.format(token=TOKEN), {}, format="json")

        assert response.status_code == 422
        assert response.json()["code"] == "validation_failed"

    def test_a_weak_password_is_refused(self, client):
        """
        `AUTH_PASSWORD_VALIDATORS` has been configured since Phase 1 and
        NOTHING CALLED IT -- the same shape as `BLACKLIST_AFTER_ROTATION`
        without its app. This is the first code path that does.
        """
        result = found()
        invite(result.organization)

        response = client.post(ACCEPT_URL.format(token=TOKEN), {"password": "x"}, format="json")

        # 422, like every other validation refusal here -- `config.exception_handler`
        # maps DRF's ValidationError, so a serializer rule and a service rule
        # answer with the same status and the form has one path to render.
        assert response.status_code == 422
        assert "password" in str(response.json()).lower()
        assert not User.objects.filter(email="pending@acme.test").exists()


class TestAcceptingWhenTheAddressAlreadyHasAnAccount:
    def test_it_refuses_to_set_a_password_through_the_link(self, client):
        """
        THE ACCOUNT TAKEOVER THIS PREVENTS. Whoever holds the link would
        otherwise be able to choose a new password for an existing account,
        which is the thing Q23 refuses from the admin side as well.
        """
        result = found()
        User.objects.create_user(email="pending@acme.test", password=PASSWORD)
        invite(result.organization)

        response = client.post(
            ACCEPT_URL.format(token=TOKEN),
            {"password": "a different password entirely"},
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "invitation_needs_sign_in"
        assert not Membership.objects.filter(user__email="pending@acme.test").exists()

        existing = User.objects.get(email="pending@acme.test")
        assert existing.check_password(PASSWORD)

    def test_signed_in_as_the_invited_person_it_joins_without_a_password(self, client):
        result = found()
        joiner = User.objects.create_user(
            email="pending@acme.test", password=PASSWORD, first_name="Priya", last_name="N"
        )
        invite(result.organization)
        client.force_authenticate(user=joiner)

        response = client.post(ACCEPT_URL.format(token=TOKEN), {}, format="json")

        assert response.status_code == 201
        assert response.json()["account_created"] is False
        assert Membership.objects.filter(user=joiner, organization=result.organization).exists()

    def test_it_keeps_the_memberships_they_already_had(self, client):
        """
        One account, several organisations (C1). Accepting adds a membership;
        it does not move anybody.
        """
        first = found()
        second = found(name="Northway", email="other@northway.test", code="CODE-NW")
        joiner = User.objects.create_user(email="pending@acme.test", password=PASSWORD)
        Membership.objects.create(
            user=joiner,
            organization=second.organization,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        invite(first.organization)
        client.force_authenticate(user=joiner)

        client.post(ACCEPT_URL.format(token=TOKEN), {}, format="json")

        assert joiner.memberships.count() == 2

    def test_signed_in_as_somebody_else_is_refused(self, client):
        """
        The likely case is an admin pasting the link to see whether it works.
        Accepting on their account would add the wrong person AND spend the
        invitation, leaving nothing to show what happened.
        """
        result = found()
        User.objects.create_user(email="pending@acme.test", password=PASSWORD)
        invite(result.organization)
        client.force_authenticate(user=result.user)

        response = client.post(ACCEPT_URL.format(token=TOKEN), {}, format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "invitation_wrong_account"

    def test_an_admin_checking_a_brand_new_persons_link_cannot_claim_it(self, client):
        """
        The other half: the invited address has NO account, and somebody is
        signed in. Without this, the invitation attaches to whoever happened
        to be signed in when the link was opened.
        """
        result = found()
        invite(result.organization)
        client.force_authenticate(user=result.user)

        response = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "invitation_wrong_account"
        assert not User.objects.filter(email="pending@acme.test").exists()


class TestALinkIsOneUse:
    def test_the_second_click_is_refused(self, client):
        """
        `select_for_update` is why this function exists. Without the
        `accepted_at` check the unique constraint on (user, organization)
        turns the second click into an IntegrityError and a 500.
        """
        result = found()
        invite(result.organization)

        first = client.post(ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json")
        second = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert first.status_code == 201
        assert second.status_code == 409
        assert second.json()["code"] == "invitation_already_accepted"
        assert Membership.objects.filter(user__email="pending@acme.test").count() == 1

    def test_an_expired_link_is_refused(self, client):
        result = found()
        invite(result.organization, expires_in_days=-1)

        response = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "invitation_expired"
        assert not User.objects.filter(email="pending@acme.test").exists()

    def test_an_unknown_token_is_404(self, client):
        found()
        response = client.post(
            ACCEPT_URL.format(token="not-a-token"), {"password": PASSWORD}, format="json"
        )
        assert response.status_code == 404

    def test_resending_kills_the_old_link(self, client):
        """
        COPY AND RESEND ARE DIFFERENT VERBS (C56). Copy hands over the same
        link; Resend mints a new token so a link that went to the wrong person
        stops working -- which is the only reason to press it.
        """
        result = found()
        invitation = invite(result.organization)
        client.force_authenticate(user=result.user)

        client.post(
            f"/api/v1/orgs/{result.organization.slug}"
            f"/admin/users/{invitation.id}/resend-invitation/"
        )

        response = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert response.status_code == 404


class TestTheWorldMayHaveMovedOn:
    def test_an_app_the_organisation_no_longer_pays_for_refuses_the_accept(self, client):
        """
        An invitation can sit for a fortnight, so the rules are re-checked
        rather than trusted from invite time (C55: a grant needs a live
        subscription).

        IT REFUSES RATHER THAN DROPPING THE GRANT. Somebody who joins with
        less access than they were promised has nothing to tell them so, and
        an admin who can see the invitation can fix the subscription or
        re-invite.
        """
        result = found()
        invite(result.organization)
        AppSubscription.objects.filter(organization=result.organization, app=AppCode.DMS).update(
            status=SubscriptionStatus.CANCELLED
        )

        response = client.post(
            ACCEPT_URL.format(token=TOKEN), {"password": PASSWORD}, format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "app_not_subscribed"
        assert not User.objects.filter(email="pending@acme.test").exists()

    def test_an_address_that_became_a_member_another_way_refuses(self, client):
        """
        Two rows claiming the same address in one organisation is what
        `_assert_email_free` exists to prevent, and the invitation is left
        unspent so an admin can see both and cancel one.

        IT SIGNS IN FIRST, AND THAT IS THE POINT OF THIS TEST. Written without
        the `force_authenticate` below it passed for entirely the wrong reason:
        an anonymous caller whose address already has an account is refused by
        `invitation_needs_sign_in` long before anything looks at memberships,
        so deleting `_assert_email_free` left it green. Reverting the fix is
        what found that --- the same "passing for the wrong reason" shape C55
        hit in `test_a_dealer_scoped_person_cannot_be_given_crm`.

        Signed in as the person themselves, this is the only guard between an
        accept and an IntegrityError on `membership_unique_user_org`, which
        would be a 500.
        """
        result = found()
        invite(result.organization)
        existing = User.objects.create_user(email="pending@acme.test", password=PASSWORD)
        Membership.objects.create(
            user=existing,
            organization=result.organization,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        client.force_authenticate(user=existing)

        response = client.post(ACCEPT_URL.format(token=TOKEN), {}, format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "email_taken"
        assert Invitation.objects.get(token=TOKEN).accepted_at is None
        assert Membership.objects.filter(user=existing).count() == 1


class TestTheLinkAnAdminCopies:
    def test_it_returns_the_link_and_when_it_dies(self, client):
        result = found()
        invitation = invite(result.organization)
        client.force_authenticate(user=result.user)

        response = client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))

        assert response.status_code == 200
        assert set(response.json()) == {"link", "expires_at"}
        assert response.json()["link"].endswith(f"/invite/{TOKEN}")

    def test_reading_it_does_not_change_the_token(self, client):
        """
        Copy is a read. Re-minting here would invalidate the message the admin
        sent thirty seconds ago -- which is the trap show-once created and the
        reason the owner chose copy-any-time.
        """
        result = found()
        invitation = invite(result.organization)
        client.force_authenticate(user=result.user)

        client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))
        client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))

        invitation.refresh_from_db()
        assert invitation.token == TOKEN

    def test_it_is_still_there_after_a_reload(self, client):
        """
        The whole of "copy any time": the link survives the dialog closing,
        the page being refreshed and the admin coming back tomorrow.
        """
        result = found()
        invitation = invite(result.organization)
        client.force_authenticate(user=result.user)

        first = client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))
        second = client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))

        assert first.json()["link"] == second.json()["link"]

    def test_somebody_who_has_already_accepted_has_no_link(self, client):
        result = found()
        member = User.objects.create_user(email="member@acme.test", password=PASSWORD)
        membership = Membership.objects.create(
            user=member,
            organization=result.organization,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        client.force_authenticate(user=result.user)

        response = client.get(LINK_URL.format(slug=result.organization.slug, id=membership.id))

        assert response.status_code == 409
        assert response.json()["code"] == "not_an_invitation"

    def test_another_dealerships_invitation_is_404_not_403(self, client):
        """
        THE SAME LEAK AS EVERYWHERE ELSE IN ADMINISTRATION, one table over. A
        dealer admin who gets 403 here learns the invitation exists; they must
        get the answer they would get for an id that was never minted.
        """
        result = found()
        mine = BusinessUnit.objects.create(organization=result.organization, name="Mine")
        theirs = BusinessUnit.objects.create(organization=result.organization, name="Theirs")

        admin_user = User.objects.create_user(email="dealeradmin@acme.test", password=PASSWORD)
        admin_membership = Membership.objects.create(
            user=admin_user,
            organization=result.organization,
            unit=mine,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        AppAccess.objects.create(
            membership=admin_membership,
            app=AppCode.DMS,
            role=dms_role("dms.system_admin"),
        )

        other = invite(result.organization, unit=theirs, email="theirs@acme.test")
        client.force_authenticate(user=admin_user)

        response = client.get(LINK_URL.format(slug=result.organization.slug, id=other.id))

        assert response.status_code == 404

    def test_another_organisations_invitation_is_404(self, client):
        first = found()
        second = found(name="Northway", email="other@northway.test", code="CODE-NW")
        theirs = invite(second.organization, email="theirs@northway.test")
        client.force_authenticate(user=first.user)

        response = client.get(LINK_URL.format(slug=first.organization.slug, id=theirs.id))

        assert response.status_code == 404

    def test_it_needs_more_than_permission_to_read_the_list(self, client):
        """
        `admin.person.invite`, not `admin.person.view`. Reading the list tells
        you somebody was invited; this hands over the credential that joins as
        them.
        """
        result = found()
        invitation = invite(result.organization)

        viewer = User.objects.create_user(email="viewer@acme.test", password=PASSWORD)
        viewer_membership = Membership.objects.create(
            user=viewer,
            organization=result.organization,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        AppAccess.objects.create(
            membership=viewer_membership, app=AppCode.DMS, role=dms_role("dms.fleet_viewer")
        )
        client.force_authenticate(user=viewer)

        response = client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))

        assert response.status_code == 403

    def test_a_stranger_gets_nothing(self, client):
        result = found()
        invitation = invite(result.organization)
        outsider = User.objects.create_user(email="nobody@elsewhere.test", password=PASSWORD)
        client.force_authenticate(user=outsider)

        response = client.get(LINK_URL.format(slug=result.organization.slug, id=invitation.id))

        assert response.status_code in {403, 404}


class TestTheLinkItself:
    def test_it_points_at_the_spa_not_at_django(self):
        """
        The link is opened by a person in a browser, so it has to address the
        SPA route that handles it -- `FRONTEND_BASE_URL`, not the API host.
        """
        result = found()
        invitation = invite(result.organization)

        assert invitation_link(invitation) == f"http://localhost:5173/invite/{TOKEN}"

    def test_it_refuses_to_build_a_link_with_no_base_url(self, settings):
        """
        A relative link pasted into a chat message is not a link, and
        defaulting to localhost in production hands every new employee an
        address that only works on the server. So it raises.
        """
        result = found()
        invitation = invite(result.organization)
        settings.FRONTEND_BASE_URL = ""

        with pytest.raises(ImproperlyConfigured):
            invitation_link(invitation)


class TestTheServiceDirectly:
    def test_it_is_callable_without_http(self):
        """
        Nothing in `services.py` is HTTP-aware (CLAUDE.md), so this has to work
        from a shell and a Celery task as well as from the view.
        """
        result = found()
        invite(result.organization)

        accepted = accept_invitation(token=TOKEN, password=PASSWORD)

        assert accepted.account_created is True
        assert accepted.organization == result.organization
        assert accepted.membership.status == MembershipStatus.ACTIVE
