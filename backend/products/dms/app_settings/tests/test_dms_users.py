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
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Role

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


def root(result):
    return Territory.objects.root_for(result.organization)


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
            "status",
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
            place=root(result),
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
            place=root(result),
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
