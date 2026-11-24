"""
The role builder (C72 piece 5; the owner, 2026-11-20, as Zoho's New Role):
Admins and Roles -> Roles -> Add Role.

- `GET  /admin/role-builder/`  the grid: the Admin panel's section tree with each
  page's actions, and the roles "Copy permissions from" offers.
- `POST /admin/panel-roles/`   make one of this organisation's own roles.

THE TESTS THAT MATTER MOST are the isolation ones: a role belongs to the
organisation that made it, and no other organisation may see it, copy it or
grant it -- even knowing its code.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import ActivationCode, Membership, Territory
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

BUILDER_URL = "/api/v1/orgs/{slug}/admin/role-builder/"
ROLES_URL = "/api/v1/orgs/{slug}/admin/panel-roles/"
CATALOGUE_URL = "/api/v1/orgs/{slug}/admin/roles/"
ASSIGN_URL = "/api/v1/orgs/{slug}/admin/users/{id}/apps/"
PASSWORD = "correct horse battery staple"

PEOPLE_ADMIN = ["admin.user.view", "admin.user.create", "admin.user.assign_app"]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)


def as_owner(client, result):
    client.force_authenticate(user=result.user)
    return result.organization.slug


def create(client, slug, name="People admin", permissions=None, description="Runs people."):
    return client.post(
        ROLES_URL.format(slug=slug),
        {
            "name": name,
            "description": description,
            "permissions": PEOPLE_ADMIN if permissions is None else permissions,
        },
        format="json",
    )


def holder_of(result, permissions, email="actor@acme.test", code="dms.test_holder") -> Membership:
    """Somebody holding exactly `permissions`, through an organisation-wide role."""
    role = Role.objects.create(code=code, name=code, app_id=AppCode.DMS, level="org", summary=".")
    for permission in permissions:
        RolePermission.objects.create(
            role=role, permission=Permission.objects.get(code=permission)
        )
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=role,
        territories=[Territory.objects.root_for(result.organization, AppCode.DMS)],
    )
    return membership


class TestTheGrid:
    def test_it_is_the_admin_panels_section_tree(self, client):
        result = found()
        slug = as_owner(client, result)

        body = client.get(BUILDER_URL.format(slug=slug)).json()

        assert [m["name"] for m in body["modules"]] == [
            "Organization",
            "App Management",
            "User Management",
        ]
        rows = {r["name"]: r for m in body["modules"] for r in m["rows"]}
        assert list(rows) == [
            "Organization Info",
            "Applications",
            "Users",
            "Admins",
            "App Admins",
            "Roles",
        ]
        users = {a["code"]: a for a in rows["Users"]["actions"]}
        assert users["view"] == {
            "code": "view",
            "name": "View",
            "kind": "basic",
            "permission": "admin.user.view",
        }
        assert users["edit_app"]["kind"] == "special"
        assert [a["code"] for a in rows["Organization Info"]["actions"]] == ["view"]

    def test_copy_from_offers_organization_admin(self, client):
        result = found()
        slug = as_owner(client, result)

        templates = client.get(BUILDER_URL.format(slug=slug)).json()["templates"]

        assert [t["name"] for t in templates] == ["Organization Admin"]
        assert "admin.user.edit_app" in templates[0]["permissions"]
        # Dealers and territories are not on the tree, so not on the grid.
        assert "admin.dealer.view" not in templates[0]["permissions"]

    def test_it_needs_a_right_to_build_roles(self, client):
        result = found()
        actor = holder_of(result, ["admin.role.view"])
        client.force_authenticate(user=actor.user)

        assert client.get(BUILDER_URL.format(slug=result.organization.slug)).status_code == 403


class TestCreating:
    def test_it_makes_the_organisations_own_role(self, client):
        result = found()
        slug = as_owner(client, result)

        response = create(client, slug)

        assert response.status_code == 201
        assert response.json() == {
            "code": response.json()["code"],
            "name": "People admin",
            "summary": "Runs people.",
            "built_in": False,
            "users": 0,
            "modified_by": "owner@acme.test",
            # The owner may give any role (C89).
            "grantable": True,
        }
        role = Role.objects.get(code=response.json()["code"])
        assert role.organization_id == result.organization.id
        assert role.app_id == AppCode.ADMIN
        assert set(role.permissions.values_list("code", flat=True)) == set(PEOPLE_ADMIN)
        assert role.code.startswith("admin.custom_")

    def test_it_appears_on_the_roles_tab_after_the_built_ins(self, client):
        result = found()
        slug = as_owner(client, result)
        create(client, slug)

        rows = client.get(ROLES_URL.format(slug=slug)).json()

        assert [(r["name"], r["built_in"]) for r in rows] == [
            ("Organization Owner", True),
            ("Organization Admin", True),
            ("People admin", False),
        ]

    def test_it_is_offered_to_copy_from_afterwards(self, client):
        result = found()
        slug = as_owner(client, result)
        create(client, slug)

        templates = client.get(BUILDER_URL.format(slug=slug)).json()["templates"]

        assert [t["name"] for t in templates] == ["Organization Admin", "People admin"]


class TestWhatIsRefused:
    def test_an_action_without_its_pages_view_rule_5(self, client):
        result = found()
        slug = as_owner(client, result)

        response = create(client, slug, permissions=["admin.user.create"])

        assert response.status_code == 422
        assert response.json()["errors"][0]["code"] == "needs_view"
        assert not Role.objects.filter(organization_id=result.organization.id).exists()

    def test_no_permission_at_all(self, client):
        result = found()
        slug = as_owner(client, result)

        response = create(client, slug, permissions=[])

        assert response.status_code == 422
        assert response.json()["errors"][0]["code"] == "required"

    @pytest.mark.parametrize(
        "outside",
        [
            "dms.enquiry.view",  # another app's
            "admin.dealer.view",  # the Admin panel's, but not on the tree
            "admin.made_up.view",  # nothing at all
        ],
    )
    def test_anything_not_on_the_admin_panels_tree(self, client, outside):
        result = found()
        slug = as_owner(client, result)

        response = create(client, slug, permissions=["admin.user.view", outside])

        assert response.status_code == 422
        assert response.json()["errors"][0]["code"] == "invalid"

    def test_a_name_this_organisation_already_uses(self, client):
        result = found()
        slug = as_owner(client, result)
        create(client, slug, name="People admin")

        response = create(client, slug, name="people ADMIN")

        assert response.status_code == 409
        assert response.json()["code"] == "role_name_taken"

    @pytest.mark.parametrize("name", ["Organization Admin", "Organisation owner"])
    def test_a_built_in_roles_name(self, client, name):
        result = found()
        slug = as_owner(client, result)

        response = create(client, slug, name=name)

        assert response.status_code == 409
        assert response.json()["code"] == "role_name_taken"

    def test_a_blank_name(self, client):
        result = found()
        slug = as_owner(client, result)

        assert create(client, slug, name="   ").status_code == 422

    def test_more_than_the_builder_holds(self, client):
        """Nobody builds a role more powerful than themselves."""
        result = found()
        actor = holder_of(result, ["admin.role.view", "admin.role.create", "admin.user.view"])
        client.force_authenticate(user=actor.user)

        response = create(
            client,
            result.organization.slug,
            permissions=["admin.user.view", "admin.user.delete"],
        )

        assert response.status_code == 403
        assert response.json()["code"] == "role_beyond_own_access"

    def test_what_the_builder_holds_is_fine(self, client):
        result = found()
        actor = holder_of(result, ["admin.role.view", "admin.role.create", "admin.user.view"])
        client.force_authenticate(user=actor.user)

        response = create(client, result.organization.slug, permissions=["admin.user.view"])

        assert response.status_code == 201

    def test_it_needs_admin_role_create(self, client):
        result = found()
        actor = holder_of(result, ["admin.role.view", "admin.user.view"])
        client.force_authenticate(user=actor.user)

        response = create(client, result.organization.slug, permissions=["admin.user.view"])

        assert response.status_code == 403
        assert not Role.objects.filter(organization_id=result.organization.id).exists()


class TestTenantIsolation:
    """A role is its organisation's alone: never seen, copied or granted elsewhere."""

    @pytest.fixture
    def two(self, client):
        mine = found()
        theirs = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        client.force_authenticate(user=theirs.user)
        code = create(client, theirs.organization.slug, name="Their role").json()["code"]
        client.force_authenticate(user=mine.user)
        return mine, theirs, code

    def test_another_organisations_role_is_not_on_my_roles_tab(self, client, two):
        mine, _theirs, _code = two

        rows = client.get(ROLES_URL.format(slug=mine.organization.slug)).json()

        assert "Their role" not in {r["name"] for r in rows}

    def test_another_organisations_role_is_not_offered_to_copy(self, client, two):
        mine, _theirs, _code = two

        templates = client.get(BUILDER_URL.format(slug=mine.organization.slug)).json()["templates"]

        assert "Their role" not in {t["name"] for t in templates}

    def test_i_may_reuse_another_organisations_role_name(self, client, two):
        mine, _theirs, _code = two

        assert create(client, mine.organization.slug, name="Their role").status_code == 201

    def test_another_organisations_custom_app_role_cannot_be_granted_here(self, client):
        """
        THE ONE THAT MATTERS. A custom role's code is no secret; naming
        another organisation's when granting an app must find nothing.
        """
        mine = found()
        theirs = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        their_role = Role.objects.create(
            code="dms.custom_theirs",
            name="Their DMS role",
            app_id=AppCode.DMS,
            level="org",
            summary=".",
            organization_id=theirs.organization.id,
        )
        user = User.objects.create_user(email="asha@acme.test", password="x")
        asha = Membership.objects.create(user=user, organization=mine.organization)
        client.force_authenticate(user=mine.user)

        response = client.post(
            ASSIGN_URL.format(slug=mine.organization.slug, id=asha.id),
            {"apps": [{"app": "dms", "role": their_role.code}]},
            format="json",
        )

        assert response.status_code == 409
        assert not asha.grants.exists()

    def test_my_own_custom_app_role_can_be_granted_here(self, client):
        mine = found()
        my_role = Role.objects.create(
            code="dms.custom_mine",
            name="My DMS role",
            app_id=AppCode.DMS,
            level="org",
            summary=".",
            organization_id=mine.organization.id,
        )
        user = User.objects.create_user(email="asha@acme.test", password="x")
        asha = Membership.objects.create(user=user, organization=mine.organization)
        client.force_authenticate(user=mine.user)

        response = client.post(
            ASSIGN_URL.format(slug=mine.organization.slug, id=asha.id),
            {"apps": [{"app": "dms", "role": my_role.code}]},
            format="json",
        )

        assert response.status_code == 200

    def test_the_role_pickers_list_shows_only_my_own(self, client):
        mine = found()
        theirs = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        for org, code in ((mine, "dms.custom_mine"), (theirs, "dms.custom_theirs")):
            Role.objects.create(
                code=code,
                name=code,
                app_id=AppCode.DMS,
                level="org",
                summary=".",
                organization_id=org.organization.id,
            )
        client.force_authenticate(user=mine.user)

        listed = client.get(CATALOGUE_URL.format(slug=mine.organization.slug)).json()
        codes = {r["code"] for r in listed}

        assert "dms.custom_mine" in codes
        assert "dms.custom_theirs" not in codes
