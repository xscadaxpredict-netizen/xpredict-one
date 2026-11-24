"""
`POST /api/v1/orgs/<slug>/admin/applications/<app>/members/` -- Assign users
(the owner, 2026-11-20): Applications -> an app -> ⋮ -> Assign users.

Several people, one role, all or nothing. The same act as Assign applications
seen from the app's side, so `assign_apps()` per person and every one of its
rules. Needs `admin.application.view` + `admin.user.view` +
`admin.user.assign_app` (C81); reading the members stays on
`admin.application.view_users`.
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
    Invitation,
    Membership,
    MembershipAppAccess,
    Territory,
    TerritoryKind,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

URL = "/api/v1/orgs/{slug}/admin/applications/{app}/members/"
PASSWORD = "correct horse battery staple"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    """DMS at signup, and CRM too."""
    ActivationCode.objects.create(code=code)
    result = sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)
    AppSubscription.objects.create(
        organization=result.organization, app_id=AppCode.CRM, status=SubscriptionStatus.ACTIVE
    )
    return result


def newcomer(result, email) -> Membership:
    """Joined, holding no app."""
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(user=user, organization=result.organization)


def pending(result, email="kiran@acme.test") -> Invitation:
    return Invitation.objects.create(
        organization=result.organization,
        email=email,
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )


def holding_dms(result, role_code, place, email) -> Membership:
    membership = newcomer(result, email)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=role_code),
        territories=[place],
    )
    return membership


def assign(client, result, app, users, role, user=None):
    client.force_authenticate(user=user or result.user)
    return client.post(
        URL.format(slug=result.organization.slug, app=app),
        {"users": [str(u) for u in users], "role": role},
        format="json",
    )


def holds(membership, app) -> bool:
    return MembershipAppAccess.objects.filter(membership=membership, app_id=app).exists()


class TestAssigning:
    def test_several_people_get_the_app_with_the_one_role(self, client):
        result = found()
        asha = newcomer(result, "asha@acme.test")
        ravi = newcomer(result, "ravi@acme.test")

        response = assign(client, result, "dms", [asha.id, ravi.id], "dms.fleet_viewer")

        assert response.status_code == 204
        for person in (asha, ravi):
            grant = MembershipAppAccess.objects.get(membership=person, app_id="dms")
            assert grant.roles.get().role.code == "dms.fleet_viewer"

    def test_they_appear_in_the_apps_members(self, client):
        result = found()
        asha = newcomer(result, "asha@acme.test")
        assign(client, result, "dms", [asha.id], "dms.fleet_viewer")

        members = client.get(URL.format(slug=result.organization.slug, app="dms")).json()

        assert "asha@acme.test" in {m["email"] for m in members}

    def test_a_pending_person_gets_it_on_their_invitation(self, client):
        result = found()
        kiran = pending(result)

        response = assign(client, result, "crm", [kiran.id], "crm.member")

        assert response.status_code == 204
        assert [g.app_id for g in kiran.app_grants.all()] == ["crm"]


class TestAllOrNothing:
    def test_one_person_who_already_holds_it_means_nobody_gets_it(self, client):
        result = found()
        asha = newcomer(result, "asha@acme.test")
        already = holding_dms(
            result,
            "dms.fleet_viewer",
            Territory.objects.root_for(result.organization, AppCode.DMS),
            "already@acme.test",
        )

        response = assign(client, result, "dms", [asha.id, already.id], "dms.fleet_viewer")

        assert response.status_code == 409
        assert response.json()["code"] == "app_already_held"
        assert not holds(asha, "dms")

    def test_somebody_at_a_dealership_cannot_be_given_crm_c27(self, client):
        result = found()
        delhi = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        asha = newcomer(result, "asha@acme.test")
        dealer_person = holding_dms(result, "dms.sales_representative", delhi, "d@acme.test")

        response = assign(client, result, "crm", [asha.id, dealer_person.id], "crm.member")

        assert response.status_code == 409
        assert response.json()["code"] == "dealer_scoped_app"
        assert not holds(asha, "crm")


class TestWhatIsRefused:
    def test_the_owner(self, client):
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)

        response = assign(client, result, "crm", [owner.id], "crm.member")

        assert response.status_code == 409
        assert response.json()["code"] == "owner_holds_every_app"

    def test_any_dms_role(self, client):
        """ONLY APP ROLES (the owner, 2026-11-24): what was a dealership role too."""
        result = found()
        asha = newcomer(result, "asha@acme.test")

        response = assign(client, result, "dms", [asha.id], "dms.manager")

        assert response.status_code < 300, response.content
        assert holds(asha, "dms")

    def test_administration(self, client):
        result = found()
        asha = newcomer(result, "asha@acme.test")

        response = assign(client, result, "admin", [asha.id], "admin.org_admin")

        assert response.status_code == 409
        assert response.json()["code"] == "administration_not_grantable"

    def test_another_organisations_person_is_404(self, client):
        result = found()
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        theirs = newcomer(other, "theirs@other.test")

        assert assign(client, result, "dms", [theirs.id], "dms.fleet_viewer").status_code == 404
        assert not holds(theirs, "dms")

    def test_nobody_is_refused_as_bad_input(self, client):
        result = found()

        assert assign(client, result, "dms", [], "dms.fleet_viewer").status_code == 422

    def test_the_same_person_twice_is_refused(self, client):
        result = found()
        asha = newcomer(result, "asha@acme.test")

        response = assign(client, result, "dms", [asha.id, asha.id], "dms.fleet_viewer")

        assert response.status_code == 422
        assert not holds(asha, "dms")


class TestPermissions:
    def _actor(self, result, permissions):
        role = Role.objects.create(
            code="dms.test_assigner", name="Test", app_id=AppCode.DMS, level="org", summary="."
        )
        for code in permissions:
            RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
        return holding_dms(
            result,
            "dms.test_assigner",
            Territory.objects.root_for(result.organization, AppCode.DMS),
            "actor@acme.test",
        )

    def test_assigning_needs_assign_app(self, client):
        """Seeing the app and its members is not enough to give it to anybody."""
        result = found()
        actor = self._actor(
            result,
            ["admin.application.view", "admin.application.view_users", "admin.user.view"],
        )
        asha = newcomer(result, "asha@acme.test")

        response = assign(client, result, "crm", [asha.id], "crm.member", user=actor.user)

        assert response.status_code == 403
        assert not holds(asha, "crm")

    def test_assign_app_with_the_two_views_is_enough(self, client):
        result = found()
        actor = self._actor(
            result,
            ["admin.application.view", "admin.user.view", "admin.user.assign_app"],
        )
        asha = newcomer(result, "asha@acme.test")

        response = assign(client, result, "crm", [asha.id], "crm.member", user=actor.user)

        assert response.status_code == 204
        assert holds(asha, "crm")

    def test_reading_members_still_needs_view_users(self, client):
        result = found()
        actor = self._actor(
            result, ["admin.application.view", "admin.user.view", "admin.user.assign_app"]
        )
        client.force_authenticate(user=actor.user)

        response = client.get(URL.format(slug=result.organization.slug, app="dms"))

        assert response.status_code == 403
