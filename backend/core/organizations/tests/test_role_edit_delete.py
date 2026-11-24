"""
Edit Role and Delete Role (C72 piece 5, after New Role): the role side panel's
Edit and Delete, for one of this organisation's OWN Admin panel roles.

- `PUT    /admin/panel-roles/<code>/`  Edit Role -- New Role's rules, all of them
- `DELETE /admin/panel-roles/<code>/`  Delete Role -- refused while anybody holds it

THE TESTS THAT MATTER MOST:

- a role held only by a PENDING person cannot be deleted either -- `role_in_use`
  with the counts, never the database's PROTECT surfacing as a generic
  `conflict` and an error in the log;
- another organisation's role is not found, however well its code is known;
- Edit cannot be used to get round a rule New Role enforces.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Invitation,
    InvitationAppGrant,
    Membership,
    Territory,
)
from core.organizations.selectors import ORGANISATION_ADMIN_ROLE, permissions_for
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

ROLES_URL = "/api/v1/orgs/{slug}/admin/panel-roles/"
ROLE_URL = "/api/v1/orgs/{slug}/admin/panel-roles/{code}/"
PASSWORD = "correct horse battery staple"

PEOPLE_ADMIN = ["admin.user.view", "admin.user.create", "admin.user.assign_app"]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)


def create(client, slug, name="People admin", permissions=None) -> str:
    response = client.post(
        ROLES_URL.format(slug=slug),
        {
            "name": name,
            "description": "Runs people.",
            "permissions": PEOPLE_ADMIN if permissions is None else permissions,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    return response.json()["code"]


def edit(client, slug, code, name="People admin", permissions=None, description="Runs people."):
    return client.put(
        ROLE_URL.format(slug=slug, code=code),
        {
            "name": name,
            "description": description,
            "permissions": PEOPLE_ADMIN if permissions is None else permissions,
        },
        format="json",
    )


def delete(client, slug, code):
    return client.delete(ROLE_URL.format(slug=slug, code=code))


def held(code) -> set[str]:
    return set(Role.objects.get(code=code).permissions.values_list("code", flat=True))


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


def give_to_member(result, code, email="priya@acme.test") -> Membership:
    """A member holding the custom role -- what Assign Admin will do."""
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.ADMIN,
        role=Role.objects.get(code=code),
        territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
    )
    return membership


def give_to_invitation(result, code, email="ravi@acme.test", accepted=False) -> Invitation:
    """A pending (or, if `accepted`, spent) invitation carrying the custom role."""
    invitation = Invitation.objects.create(
        organization=result.organization,
        email=email,
        token=f"token-{email}",
        expires_at=timezone.now() + timedelta(days=14),
        accepted_at=timezone.now() if accepted else None,
    )
    InvitationAppGrant.objects.create(
        invitation=invitation, app_id=AppCode.ADMIN, role=Role.objects.get(code=code)
    )
    return invitation


@pytest.fixture
def acme(client):
    result = found()
    client.force_authenticate(user=result.user)
    return result


class TestEditing:
    def test_it_changes_name_description_and_permissions(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        response = edit(
            client,
            slug,
            code,
            name="People lead",
            description="Leads people.",
            permissions=["admin.user.view", "admin.user.update"],
        )

        assert response.status_code == 200
        assert response.json() == {
            "code": code,
            "name": "People lead",
            "summary": "Leads people.",
            "built_in": False,
            "users": 0,
            "modified_by": "owner@acme.test",
            # The owner may give any role (C89).
            "grantable": True,
        }
        assert held(code) == {"admin.user.view", "admin.user.update"}

    def test_the_code_never_changes(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        edit(client, slug, code, name="Renamed")

        assert Role.objects.filter(code=code, name="Renamed").exists()

    def test_a_kept_permission_keeps_its_row(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)
        kept = RolePermission.objects.get(role__code=code, permission__code="admin.user.view")

        edit(client, slug, code, permissions=["admin.user.view"])

        assert RolePermission.objects.filter(pk=kept.pk).exists()
        assert held(code) == {"admin.user.view"}

    def test_it_may_keep_its_own_name_in_any_case(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug, name="People admin")

        assert edit(client, slug, code, name="People admin").status_code == 200
        assert edit(client, slug, code, name="PEOPLE ADMIN").status_code == 200

    def test_a_holder_gets_the_new_permissions(self, client, acme):
        """Permissions are read from the role, never copied onto the person."""
        slug = acme.organization.slug
        code = create(client, slug)
        priya = give_to_member(acme, code)

        edit(client, slug, code, permissions=["admin.user.view", "admin.user.delete"])

        permissions = permissions_for(Membership.objects.get(pk=priya.pk))
        assert "admin.user.delete" in permissions
        assert "admin.user.create" not in permissions


class TestEditRefusesWhatNewRoleRefuses:
    """An Edit that skipped a rule would be the way round it."""

    def test_another_roles_name(self, client, acme):
        slug = acme.organization.slug
        create(client, slug, name="People admin")
        code = create(client, slug, name="Helper")

        response = edit(client, slug, code, name="people admin")

        assert response.status_code == 409
        assert response.json()["code"] == "role_name_taken"

    @pytest.mark.parametrize("name", ["Organization Admin", "organisation owner"])
    def test_a_built_in_roles_name(self, client, acme, name):
        slug = acme.organization.slug
        code = create(client, slug)

        assert edit(client, slug, code, name=name).json()["code"] == "role_name_taken"

    def test_an_action_without_its_pages_view_rule_5(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        response = edit(client, slug, code, permissions=["admin.user.create"])

        assert response.status_code == 422
        assert response.json()["errors"][0]["code"] == "needs_view"
        assert held(code) == set(PEOPLE_ADMIN)

    def test_no_permission_at_all(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        assert edit(client, slug, code, permissions=[]).status_code == 422
        assert held(code) == set(PEOPLE_ADMIN)

    def test_a_permission_off_the_admin_panels_tree(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        response = edit(client, slug, code, permissions=["admin.user.view", "dms.enquiry.view"])

        assert response.status_code == 422
        assert response.json()["errors"][0]["code"] == "invalid"

    def test_a_blank_name(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        assert edit(client, slug, code, name="  ").status_code == 422

    def test_more_than_the_editor_holds(self, client, acme):
        """Build a harmless role, then edit power into it: refused."""
        actor = holder_of(
            acme, ["admin.role.view", "admin.role.create", "admin.role.update", "admin.user.view"]
        )
        client.force_authenticate(user=actor.user)
        slug = acme.organization.slug
        code = create(client, slug, permissions=["admin.user.view"])

        response = edit(client, slug, code, permissions=["admin.user.view", "admin.user.delete"])

        assert response.status_code == 403
        assert response.json()["code"] == "role_beyond_own_access"
        assert held(code) == {"admin.user.view"}

    def test_it_needs_admin_role_update(self, client, acme):
        actor = holder_of(acme, ["admin.role.view", "admin.role.create", "admin.user.view"])
        client.force_authenticate(user=actor.user)
        slug = acme.organization.slug
        code = create(client, slug, permissions=["admin.user.view"])

        response = edit(client, slug, code, name="Renamed", permissions=["admin.user.view"])

        assert response.status_code == 403
        assert Role.objects.get(code=code).name == "People admin"

    def test_it_needs_the_roles_tabs_view_beside_it(self, client, acme):
        """Write-only, so the page's view sits beside the act (C81)."""
        slug = acme.organization.slug
        code = create(client, slug)
        actor = holder_of(acme, ["admin.role.update", "admin.user.view"])
        client.force_authenticate(user=actor.user)

        response = edit(client, slug, code, permissions=["admin.user.view"])

        assert response.status_code == 403


class TestBuiltInRoles:
    @pytest.mark.parametrize("code", [ORGANISATION_ADMIN_ROLE, "owner"])
    def test_cannot_be_edited(self, client, acme, code):
        response = edit(client, acme.organization.slug, code)

        assert response.status_code == 409
        assert response.json()["code"] == "built_in_role_unchangeable"

    @pytest.mark.parametrize("code", [ORGANISATION_ADMIN_ROLE, "owner"])
    def test_cannot_be_deleted(self, client, acme, code):
        response = delete(client, acme.organization.slug, code)

        assert response.status_code == 409
        assert response.json()["code"] == "built_in_role_unchangeable"
        if code != "owner":
            assert Role.objects.filter(code=code).exists()

    def test_an_app_roles_code_is_not_found(self, client, acme):
        """Only the Admin panel's roles are changed here; DMS's are not on this tab."""
        own_dms = Role.objects.create(
            code="dms.custom_mine",
            name="My DMS role",
            app_id=AppCode.DMS,
            level="org",
            summary=".",
            organization_id=acme.organization.id,
        )

        assert delete(client, acme.organization.slug, own_dms.code).status_code == 404
        assert Role.objects.filter(pk=own_dms.pk).exists()

    def test_a_made_up_code_is_not_found(self, client, acme):
        assert delete(client, acme.organization.slug, "admin.custom_nope").status_code == 404


class TestDeleting:
    def test_a_role_nobody_holds_goes(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)

        response = delete(client, slug, code)

        assert response.status_code == 204
        assert not Role.objects.filter(code=code).exists()
        assert not RolePermission.objects.filter(role__code=code).exists()
        names = {r["name"] for r in client.get(ROLES_URL.format(slug=slug)).json()}
        assert "People admin" not in names

    def test_its_name_is_free_again(self, client, acme):
        slug = acme.organization.slug
        delete(client, slug, create(client, slug, name="People admin"))

        create(client, slug, name="People admin")

    def test_refused_while_a_member_holds_it(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)
        give_to_member(acme, code)

        response = delete(client, slug, code)

        assert response.status_code == 409
        assert response.json()["code"] == "role_in_use"
        assert response.json()["detail"] == (
            "People admin is held by 1 person. Take the role away from them first."
        )
        assert Role.objects.filter(code=code).exists()

    def test_refused_while_only_a_pending_person_holds_it(self, client, acme):
        """
        THE ONE THAT MATTERS. Nobody holds it as a member, so a check of
        members alone would pass -- and the invitation's PROTECT would answer
        with a generic `conflict` that tells the admin nothing.
        """
        slug = acme.organization.slug
        code = create(client, slug)
        give_to_invitation(acme, code)

        response = delete(client, slug, code)

        assert response.status_code == 409
        assert response.json()["code"] == "role_in_use"
        assert "(1 pending)" in response.json()["detail"]
        assert Role.objects.filter(code=code).exists()

    def test_counts_members_and_pending_people_together(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)
        give_to_member(acme, code)
        give_to_invitation(acme, code)

        detail = delete(client, slug, code).json()["detail"]

        assert detail == (
            "People admin is held by 2 people (1 pending). Take the role away from them first."
        )

    def test_a_spent_invitation_does_not_hold_it(self, client, acme):
        """Accepting copied the grant onto the member; the offer itself is history."""
        slug = acme.organization.slug
        code = create(client, slug)
        spent = give_to_invitation(acme, code, accepted=True)

        assert delete(client, slug, code).status_code == 204
        assert not spent.app_grants.exists()

    def test_it_needs_admin_role_delete(self, client, acme):
        slug = acme.organization.slug
        code = create(client, slug)
        actor = holder_of(acme, ["admin.role.view", "admin.role.update"])
        client.force_authenticate(user=actor.user)

        assert delete(client, slug, code).status_code == 403
        assert Role.objects.filter(code=code).exists()

    def test_a_dealer_admin_cannot(self, client, acme):
        """The DMS System administrator holds no role permissions."""
        slug = acme.organization.slug
        code = create(client, slug)
        actor = holder_of(acme, ["admin.user.view", "admin.user.update"])
        client.force_authenticate(user=actor.user)

        assert delete(client, slug, code).status_code == 403


class TestTenantIsolation:
    """Another organisation's role is not found -- for editing or deleting."""

    @pytest.fixture
    def theirs(self, client):
        mine = found()
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        client.force_authenticate(user=other.user)
        code = create(client, other.organization.slug, name="Their role")
        client.force_authenticate(user=mine.user)
        return mine, code

    def test_i_cannot_edit_it(self, client, theirs):
        mine, code = theirs

        response = edit(client, mine.organization.slug, code, name="Mine now")

        assert response.status_code == 404
        assert Role.objects.get(code=code).name == "Their role"

    def test_i_cannot_delete_it(self, client, theirs):
        mine, code = theirs

        assert delete(client, mine.organization.slug, code).status_code == 404
        assert Role.objects.filter(code=code).exists()

    def test_editing_mine_ignores_their_names(self, client, theirs):
        mine, _code = theirs
        my_code = create(client, mine.organization.slug, name="Helper")

        assert edit(client, mine.organization.slug, my_code, name="Their role").status_code == 200
