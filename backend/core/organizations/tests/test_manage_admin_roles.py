"""
Manage Roles and Unassign on an admin's row (the owner, 2026-11-23):

- `PUT    /admin/admins/<id>/ {"role": code}`  change their Admin panel role
- `DELETE /admin/admins/<id>/`                 take it away

THE RULES THAT MATTER (the owner's three choices):

- nobody changes or unassigns THEIR OWN admin role -- it would lock them out;
- nobody acts on somebody whose current role is more than they hold, and
  nobody gives a role beyond their own access;
- unassigning leaves every other app in place.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipAppRole,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import (
    GRANTS_PREFETCH,
    ORGANISATION_ADMIN_ROLE,
    admin_role_of,
    standing,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

PASSWORD = "correct horse battery staple"
APPLICATION_ADMIN = ["admin.application.view", "admin.application.view_users"]
MANAGER = ["admin.admin.view", "admin.admin.assign_admin", "admin.admin.unassign_admin"]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)


@pytest.fixture
def acme(client):
    result = found()
    client.force_authenticate(user=result.user)
    return result


def custom_role(result, name="Application Admin", permissions=None, code=None) -> Role:
    role = Role.objects.create(
        code=code or f"admin.custom_{name.lower().replace(' ', '_')}",
        name=name,
        app_id=AppCode.ADMIN,
        level="org",
        summary="",
        organization_id=result.organization.id,
    )
    for permission in permissions if permissions is not None else APPLICATION_ADMIN:
        RolePermission.objects.create(role=role, permission=Permission.objects.get(code=permission))
    return role


def admin_holding(result, role: Role, email="ravi@acme.test", with_dms=False) -> Membership:
    """A member holding `role` in the Admin panel, at the root (and DMS too, if asked)."""
    user = User.objects.create_user(email=email, password="x", first_name=email.split("@")[0])
    membership = Membership.objects.create(user=user, organization=result.organization)
    if with_dms:
        grant_app_access(
            membership=membership,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.group_operations"),
            territories=[Territory.objects.root_for(result.organization, AppCode.DMS)],
        )
    grant_app_access(
        membership=membership,
        app=AppCode.ADMIN,
        role=role,
        territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
    )
    return membership


def org_admin(result, email="ravi@acme.test", **kwargs) -> Membership:
    return admin_holding(
        result, Role.objects.get(code=ORGANISATION_ADMIN_ROLE), email=email, **kwargs
    )


def fresh(membership: Membership) -> Membership:
    return Membership.objects.prefetch_related(*GRANTS_PREFETCH).get(pk=membership.pk)


def url(result, person):
    return f"/api/v1/orgs/{result.organization.slug}/admin/admins/{person.pk}/"


def change(client, result, person, role_code):
    return client.put(url(result, person), {"role": role_code}, format="json")


def unassign(client, result, person):
    return client.delete(url(result, person))


class TestManageRoles:
    def test_it_changes_the_role_and_the_tab_follows(self, client, acme):
        ravi = org_admin(acme)
        role = custom_role(acme)

        response = change(client, acme, ravi, role.code)

        assert response.status_code == 200
        row = next(r for r in response.json() if r["email"] == "ravi@acme.test")
        assert (row["role"], row["admin_role"]["name"], row["apps_managed"]) == (
            "custom",
            "Application Admin",
            [],
        )
        assert standing(fresh(ravi)) == "member"

    def test_it_can_raise_somebody_to_organization_admin(self, client, acme):
        meena = admin_holding(acme, custom_role(acme), email="meena@acme.test")

        assert change(client, acme, meena, ORGANISATION_ADMIN_ROLE).status_code == 200
        assert standing(fresh(meena)) == "admin"

    def test_the_role_row_names_who_changed_it(self, client, acme):
        ravi = org_admin(acme)

        change(client, acme, ravi, custom_role(acme).code)

        grant = MembershipAppAccess.objects.get(membership=ravi, app_id=AppCode.ADMIN)
        assert MembershipAppRole.objects.get(app_access=grant).updated_by_user_id == acme.user.id

    @pytest.mark.parametrize("code", ["owner", "dms.group_operations", "admin.custom_nope"])
    def test_anything_but_an_admin_panel_role_is_not_found(self, client, acme, code):
        ravi = org_admin(acme)

        assert change(client, acme, ravi, code).status_code == 404
        assert standing(fresh(ravi)) == "admin"


class TestUnassign:
    def test_it_takes_the_role_away_and_keeps_every_other_app(self, client, acme):
        ravi = org_admin(acme, with_dms=True)

        response = unassign(client, acme, ravi)

        assert response.status_code == 200
        assert "ravi@acme.test" not in {r["email"] for r in response.json()}
        assert admin_role_of(fresh(ravi)) is None
        assert MembershipAppAccess.objects.filter(membership=ravi, app_id=AppCode.DMS).exists()

    def test_the_roles_count_drops(self, client, acme):
        ravi = org_admin(acme)
        before = {
            r["code"]: r["users"]
            for r in client.get(
                f"/api/v1/orgs/{acme.organization.slug}/admin/panel-roles/"
            ).json()
        }

        unassign(client, acme, ravi)

        after = {
            r["code"]: r["users"]
            for r in client.get(
                f"/api/v1/orgs/{acme.organization.slug}/admin/panel-roles/"
            ).json()
        }
        assert after[ORGANISATION_ADMIN_ROLE] == before[ORGANISATION_ADMIN_ROLE] - 1


class TestWhoCannotBeActedOn:
    """Both acts share these refusals."""

    @pytest.mark.parametrize("act", ["change", "unassign"])
    def test_the_owner(self, client, acme, act):
        owner = Membership.objects.get(user=acme.user, organization=acme.organization)

        response = (
            change(client, acme, owner, ORGANISATION_ADMIN_ROLE)
            if act == "change"
            else unassign(client, acme, owner)
        )

        assert response.status_code == 409
        assert response.json()["code"] == "owner_holds_every_app"

    @pytest.mark.parametrize("act", ["change", "unassign"])
    def test_somebody_who_is_not_an_admin(self, client, acme, act):
        user = User.objects.create_user(email="asha@acme.test", password="x")
        asha = Membership.objects.create(user=user, organization=acme.organization)

        response = (
            change(client, acme, asha, ORGANISATION_ADMIN_ROLE)
            if act == "change"
            else unassign(client, acme, asha)
        )

        assert response.status_code == 409
        assert response.json()["code"] == "not_an_admin"

    @pytest.mark.parametrize("act", ["change", "unassign"])
    def test_yourself(self, client, acme, act):
        """The owner's choice: it would lock you out with no way back."""
        ravi = org_admin(acme)
        client.force_authenticate(user=ravi.user)

        response = (
            change(client, acme, ravi, custom_role(acme).code)
            if act == "change"
            else unassign(client, acme, ravi)
        )

        assert response.status_code == 409
        assert response.json()["code"] == "own_admin_role"
        assert standing(fresh(ravi)) == "admin"

    @pytest.mark.parametrize("act", ["change", "unassign"])
    def test_somebody_whose_role_is_more_than_you_hold(self, client, acme, act):
        """The owner's choice: an "Application Admin" cannot strip an Organization Admin."""
        manager = admin_holding(
            acme,
            custom_role(acme, "People Lead", [*MANAGER, *APPLICATION_ADMIN]),
            email="lead@acme.test",
        )
        ravi = org_admin(acme)
        client.force_authenticate(user=manager.user)

        response = (
            change(client, acme, ravi, custom_role(acme).code)
            if act == "change"
            else unassign(client, acme, ravi)
        )

        assert response.status_code == 403
        assert response.json()["code"] == "role_beyond_own_access"
        assert standing(fresh(ravi)) == "admin"

    def test_a_weaker_admin_can_be_managed(self, client, acme):
        manager = admin_holding(
            acme,
            custom_role(acme, "People Lead", [*MANAGER, *APPLICATION_ADMIN]),
            email="lead@acme.test",
        )
        meena = admin_holding(acme, custom_role(acme), email="meena@acme.test")
        client.force_authenticate(user=manager.user)

        assert unassign(client, acme, meena).status_code == 200

    def test_never_a_new_role_beyond_your_own_access(self, client, acme):
        manager = admin_holding(
            acme,
            custom_role(acme, "People Lead", [*MANAGER, *APPLICATION_ADMIN]),
            email="lead@acme.test",
        )
        meena = admin_holding(acme, custom_role(acme), email="meena@acme.test")
        client.force_authenticate(user=manager.user)

        response = change(client, acme, meena, ORGANISATION_ADMIN_ROLE)

        assert response.status_code == 403
        assert admin_role_of(fresh(meena)).name == "Application Admin"


class TestPermissions:
    def test_manage_roles_needs_assign_admin(self, client, acme):
        manager = admin_holding(
            acme,
            custom_role(
                acme,
                "Unassigner",
                ["admin.admin.view", "admin.admin.unassign_admin", *APPLICATION_ADMIN],
            ),
            email="lead@acme.test",
        )
        meena = admin_holding(acme, custom_role(acme), email="meena@acme.test")
        client.force_authenticate(user=manager.user)

        assert change(client, acme, meena, custom_role(acme, "Other").code).status_code == 403
        assert unassign(client, acme, meena).status_code == 200

    def test_unassign_needs_unassign_admin(self, client, acme):
        manager = admin_holding(
            acme,
            custom_role(
                acme,
                "Assigner",
                ["admin.admin.view", "admin.admin.assign_admin", *APPLICATION_ADMIN],
            ),
            email="lead@acme.test",
        )
        meena = admin_holding(acme, custom_role(acme), email="meena@acme.test")
        client.force_authenticate(user=manager.user)

        assert unassign(client, acme, meena).status_code == 403
        assert admin_role_of(fresh(meena)) is not None

    def test_a_dealer_admin_cannot(self, client, acme):
        delhi = Territory.objects.create(
            organization=acme.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        user = User.objects.create_user(email="dealer@acme.test", password="x")
        dealer_admin = Membership.objects.create(user=user, organization=acme.organization)
        grant_app_access(
            membership=dealer_admin,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.system_admin"),
            territories=[delhi],
        )
        ravi = org_admin(acme)
        client.force_authenticate(user=user)

        assert unassign(client, acme, ravi).status_code == 403


class TestTenantIsolation:
    def test_another_organisations_admin_is_not_found(self, client, acme):
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        theirs = org_admin(other, email="their.admin@other.test")

        assert unassign(client, acme, theirs).status_code == 404
        assert change(client, acme, theirs, custom_role(acme).code).status_code == 404
        assert standing(fresh(theirs)) == "admin"

    def test_another_organisations_role_is_not_found(self, client, acme):
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        their_role = custom_role(other, code="admin.custom_theirs")
        ravi = org_admin(acme)

        assert change(client, acme, ravi, their_role.code).status_code == 404
