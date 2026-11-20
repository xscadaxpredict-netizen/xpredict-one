"""
`POST /api/v1/orgs/<slug>/admin/users/<id>/apps/` -- Assign applications
(C83, the owner 2026-11-20): Admin panel -> Users -> a person -> Applications.

One or more apps, each with its role; all or nothing. Adds, never replaces.
Placed at the organisation's root (organisation-level roles) until each app has
its own territories (C82). A pending person gets them on the invitation.
Needs `admin.user.view` + `admin.user.assign_app` (C81).
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
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import reach
from core.organizations.services import accept_invitation, grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

URL = "/api/v1/orgs/{slug}/admin/users/{id}/apps/"
PASSWORD = "correct horse battery staple"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME", crm=True):
    """DMS is subscribed at signup; CRM too, unless asked not to."""
    ActivationCode.objects.create(code=code)
    result = sign_up(
        activation_code=code, organization_name=name, email=email, password=PASSWORD
    )
    if crm:
        AppSubscription.objects.create(
            organization=result.organization, app_id=AppCode.CRM, status=SubscriptionStatus.ACTIVE
        )
    return result


def newcomer(result, email="asha@acme.test") -> Membership:
    """Somebody who has joined with no app -- the usual newcomer since C83."""
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(user=user, organization=result.organization)


def pending(result, email="kiran@acme.test") -> Invitation:
    return Invitation.objects.create(
        organization=result.organization,
        email=email,
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )


def holding(result, role_code, place=None, email="someone@acme.test") -> Membership:
    membership = newcomer(result, email)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=role_code),
        territories=[place or Territory.objects.root_for(result.organization)],
    )
    return membership


def assign(client, result, person_id, apps, user=None):
    client.force_authenticate(user=user or result.user)
    return client.post(
        URL.format(slug=result.organization.slug, id=person_id), {"apps": apps}, format="json"
    )


DMS = {"app": "dms", "role": "dms.group_operations"}
CRM = {"app": "crm", "role": "crm.member"}


class TestAssigning:
    def test_it_gives_a_person_an_app_organisation_wide(self, client):
        result = found()
        asha = newcomer(result)

        response = assign(client, result, asha.id, [DMS])

        assert response.status_code == 200
        assert response.json()["apps"] == [
            {"app": "dms", "role_code": "dms.group_operations", "role_name": "Group operations"}
        ]
        assert reach(Membership.objects.get(pk=asha.pk)) is None

    def test_several_apps_in_one_request(self, client):
        result = found()
        asha = newcomer(result)

        response = assign(client, result, asha.id, [DMS, CRM])

        assert response.status_code == 200
        assert sorted(a["app"] for a in response.json()["apps"]) == ["crm", "dms"]

    def test_a_pending_person_gets_them_on_the_invitation_and_holds_them_on_joining(self, client):
        result = found()
        kiran = pending(result)

        response = assign(client, result, kiran.id, [CRM])

        assert response.status_code == 200
        assert response.json()["status"] == "invited"
        assert [g.app_id for g in kiran.app_grants.all()] == ["crm"]
        member = accept_invitation(token=kiran.token, password=PASSWORD).membership
        assert [g.app_id for g in member.grants.all()] == ["crm"]


class TestWhatIsRefused:
    def test_an_app_the_person_already_has(self, client):
        """Adds, never replaces: a role is changed from the app's tile."""
        result = found()
        them = holding(result, "dms.fleet_viewer")

        response = assign(client, result, them.id, [DMS])

        assert response.status_code == 409
        assert response.json()["code"] == "app_already_held"
        assert them.grants.get().roles.get().role.code == "dms.fleet_viewer"

    def test_all_or_nothing(self, client):
        """CRM is fine, DMS is already held: neither is assigned."""
        result = found()
        them = holding(result, "dms.fleet_viewer")

        response = assign(client, result, them.id, [CRM, DMS])

        assert response.status_code == 409
        assert [g.app_id for g in them.grants.all()] == ["dms"]

    def test_an_app_the_organisation_has_not_bought(self, client):
        result = found(crm=False)
        asha = newcomer(result)

        response = assign(client, result, asha.id, [CRM])

        assert response.status_code == 409
        assert response.json()["code"] == "app_not_subscribed"

    def test_a_dealership_level_role(self, client):
        """Organisation-wide until per-app territories (C82): org-level roles only."""
        result = found()
        asha = newcomer(result)

        response = assign(client, result, asha.id, [{"app": "dms", "role": "dms.manager"}])

        assert response.status_code == 409
        assert response.json()["code"] == "role_scope_mismatch"

    def test_another_apps_role(self, client):
        result = found()
        asha = newcomer(result)

        response = assign(client, result, asha.id, [{"app": "crm", "role": "dms.fleet_viewer"}])

        assert response.status_code == 409
        assert response.json()["code"] == "role_scope_mismatch"

    def test_the_admin_panel_itself(self, client):
        result = found()
        asha = newcomer(result)

        response = assign(client, result, asha.id, [{"app": "admin", "role": "admin.org_admin"}])

        assert response.status_code == 409
        assert response.json()["code"] == "administration_not_grantable"

    def test_an_organisation_wide_app_beside_a_dealership_place(self, client):
        """C27: somebody at a dealership (through DMS) holds no organisation-wide app."""
        result = found()
        delhi = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        them = holding(result, "dms.manager", place=delhi)

        response = assign(client, result, them.id, [CRM])

        assert response.status_code == 409
        assert response.json()["code"] == "dealer_scoped_app"

    def test_the_owner(self, client):
        result = found()

        response = assign(client, result, result.membership.id, [CRM])

        assert response.status_code == 409
        assert response.json()["code"] == "owner_holds_every_app"

    def test_no_apps_or_the_same_app_twice(self, client):
        result = found()
        asha = newcomer(result)

        assert assign(client, result, asha.id, []).status_code == 422
        assert assign(client, result, asha.id, [CRM, CRM]).status_code == 422
        assert not asha.grants.exists()


class TestWhoMayAssign:
    def test_an_organisation_admin_may(self, client):
        result = found()
        admin = holding(result, "dms.fleet_viewer", email="admin@acme.test")
        grant_app_access(
            membership=admin,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[Territory.objects.root_for(result.organization)],
        )
        asha = newcomer(result)

        assert assign(client, result, asha.id, [CRM], user=admin.user).status_code == 200

    def test_assign_app_without_the_users_view_is_refused(self, client):
        """C81: the page's view beside the act."""
        result = found()
        role = Role.objects.create(
            code="dms.test_only", name="Test", app_id=AppCode.DMS, level="org", summary="."
        )
        RolePermission.objects.create(
            role=role, permission=Permission.objects.get(code="admin.user.assign_app")
        )
        them = newcomer(result, "assigner@acme.test")
        grant_app_access(
            membership=them,
            app=AppCode.DMS,
            role=role,
            territories=[Territory.objects.root_for(result.organization)],
        )
        asha = newcomer(result)

        assert assign(client, result, asha.id, [CRM], user=them.user).status_code == 403

    def test_a_dealer_admin_may_not(self, client):
        result = found()
        delhi = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        dealer_admin = holding(result, "dms.system_admin", place=delhi, email="da@acme.test")
        asha = newcomer(result)

        assert assign(client, result, asha.id, [CRM], user=dealer_admin.user).status_code == 403

    def test_another_organisations_person_is_404(self, client):
        result = found()
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        theirs = newcomer(other, "theirs@other.test")

        assert assign(client, result, theirs.id, [CRM]).status_code == 404

    def test_somebody_outside_the_assigners_reach_is_404(self, client):
        """
        Both permissions, but placed at one dealership: a person who sits
        nowhere (no app yet) is outside their reach -- 404, as if not there.
        """
        result = found()
        delhi = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        role = Role.objects.create(
            code="dms.test_assigner", name="Test", app_id=AppCode.DMS, level="unit", summary="."
        )
        for code in ("admin.user.view", "admin.user.assign_app"):
            RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
        them = newcomer(result, "assigner@acme.test")
        grant_app_access(membership=them, app=AppCode.DMS, role=role, territories=[delhi])
        asha = newcomer(result)

        response = assign(client, result, asha.id, [DMS], user=them.user)

        assert response.status_code == 404
        assert not asha.grants.exists()
