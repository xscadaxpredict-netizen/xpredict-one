"""
Assign Admin (C89; the owner, 2026-11-23, from Zoho's): Admins and Roles ->
Admins -> Assign Admin. `POST /admin/admins/ {"users": [ids], "role": code}` --
one Admin panel role, Organization Admin or one of the organisation's own, for
several people, all or nothing.

THE RULES THAT MATTER:

- nobody gives a role beyond their own access -- but anybody with
  `admin.admin.assign_admin` may give any role they do not exceed, Organization
  Admin included (the owner chose (b));
- one Admin panel role per person; Assign Admin only adds;
- not a pending person, not the owner, not somebody placed at a dealership
  (an Admin panel role reaches the whole organisation);
- another organisation's role or person is not found.
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
GIVER = ["admin.admin.view", "admin.admin.assign_admin", "admin.user.view", "admin.role.view"]


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


def url(result, path="admins/"):
    return f"/api/v1/orgs/{result.organization.slug}/admin/{path}"


def custom_role(result, name="Application Admin", permissions=None, code=None) -> Role:
    role = Role.objects.create(
        code=code or f"admin.custom_{name.lower().replace(' ', '_')}",
        name=name,
        app_id=AppCode.ADMIN,
        level="org",
        summary="",
        organization_id=result.organization.id,
    )
    for permission in permissions or APPLICATION_ADMIN:
        RolePermission.objects.create(role=role, permission=Permission.objects.get(code=permission))
    return role


def member(result, email="meena@acme.test", place=None) -> Membership:
    """A joined member holding DMS at `place` (or the root) -- no Admin panel role."""
    user = User.objects.create_user(email=email, password="x", first_name=email.split("@")[0])
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code="dms.sales_representative" if place else "dms.group_operations"),
        territories=[place or Territory.objects.root_for(result.organization)],
    )
    return membership


def plain_member(result, email="asha@acme.test") -> Membership:
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(user=user, organization=result.organization)


def fresh(membership: Membership) -> Membership:
    return Membership.objects.prefetch_related(*GRANTS_PREFETCH).get(pk=membership.pk)


def assign(client, result, people, role_code):
    return client.post(
        url(result),
        {"users": [str(p.pk) for p in people], "role": role_code},
        format="json",
    )


def giver_holding(result, permissions, email="giver@acme.test") -> Membership:
    """Somebody holding exactly `permissions` through an Admin panel role at the root."""
    role = custom_role(
        result, name=f"Giver {email}", permissions=permissions, code=f"admin.g_{email}"
    )
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.ADMIN,
        role=role,
        territories=[Territory.objects.root_for(result.organization)],
    )
    return membership


class TestAssigning:
    def test_it_gives_a_custom_role_and_answers_with_the_admins_tab(self, client, acme):
        role = custom_role(acme)
        meena = member(acme)

        response = assign(client, acme, [meena], role.code)

        assert response.status_code == 200
        row = next(r for r in response.json() if r["email"] == "meena@acme.test")
        assert (row["role"], row["admin_role"]["name"], row["apps_managed"]) == (
            "custom",
            "Application Admin",
            [],
        )
        assert admin_role_of(fresh(meena)).code == role.code
        assert standing(fresh(meena)) == "member"

    def test_it_can_make_an_organization_admin(self, client, acme):
        meena = member(acme)

        assert assign(client, acme, [meena], ORGANISATION_ADMIN_ROLE).status_code == 200
        assert standing(fresh(meena)) == "admin"

    def test_several_people_at_once_and_the_count_follows(self, client, acme):
        role = custom_role(acme)
        people = [member(acme, "meena@acme.test"), plain_member(acme, "asha@acme.test")]

        assign(client, acme, people, role.code)

        counts = {r["code"]: r["users"] for r in client.get(url(acme, "panel-roles/")).json()}
        assert counts[role.code] == 2
        assert counts[ORGANISATION_ADMIN_ROLE] == 0

    def test_the_grant_sits_at_the_root_and_names_who_gave_it(self, client, acme):
        """Organisation-wide (C89), and Q71: the role row records its maker."""
        role = custom_role(acme)
        meena = member(acme)

        assign(client, acme, [meena], role.code)

        grant = MembershipAppAccess.objects.get(membership=meena, app_id=AppCode.ADMIN)
        assert [p.territory.is_root for p in grant.territories.all()] == [True]
        assert MembershipAppRole.objects.get(app_access=grant).created_by_user_id == acme.user.id

    def test_all_or_nothing(self, client, acme):
        """One person who cannot be given it means nobody is."""
        role = custom_role(acme)
        fine = member(acme, "meena@acme.test")
        already = member(acme, "ravi@acme.test")
        assign(client, acme, [already], ORGANISATION_ADMIN_ROLE)

        response = assign(client, acme, [fine, already], role.code)

        assert response.status_code == 409
        assert admin_role_of(fresh(fine)) is None


class TestWhoCannotBeGivenOne:
    def test_somebody_who_already_holds_one(self, client, acme):
        meena = member(acme)
        assign(client, acme, [meena], ORGANISATION_ADMIN_ROLE)

        response = assign(client, acme, [meena], custom_role(acme).code)

        assert response.status_code == 409
        assert response.json()["code"] == "already_an_admin"
        assert standing(fresh(meena)) == "admin"

    def test_a_pending_person(self, client, acme):
        invitation = Invitation.objects.create(
            organization=acme.organization,
            email="kiran@acme.test",
            token="token-kiran",
            expires_at=timezone.now() + timedelta(days=7),
        )

        response = assign(client, acme, [invitation], ORGANISATION_ADMIN_ROLE)

        assert response.status_code == 409
        assert response.json()["code"] == "admin_not_joined"

    def test_the_owner(self, client, acme):
        owner = Membership.objects.get(user=acme.user, organization=acme.organization)

        response = assign(client, acme, [owner], ORGANISATION_ADMIN_ROLE)

        assert response.status_code == 409
        assert response.json()["code"] == "owner_holds_every_app"

    def test_somebody_at_a_dealership(self, client, acme):
        """An Admin panel role reaches the whole organisation; theirs is one dealership."""
        delhi = Territory.objects.create(
            organization=acme.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        kiran = member(acme, "kiran@acme.test", place=delhi)

        response = assign(client, acme, [kiran], custom_role(acme).code)

        assert response.status_code == 409
        assert response.json()["code"] == "admin_at_dealership"
        assert admin_role_of(fresh(kiran)) is None

    def test_nobody_at_all(self, client, acme):
        response = client.post(
            url(acme), {"users": [], "role": ORGANISATION_ADMIN_ROLE}, format="json"
        )

        assert response.status_code == 422


class TestTheRole:
    @pytest.mark.parametrize("code", ["owner", "dms.group_operations", "admin.custom_nope"])
    def test_anything_but_an_admin_panel_role_is_not_found(self, client, acme, code):
        response = assign(client, acme, [member(acme)], code)

        assert response.status_code == 404

    def test_never_beyond_the_givers_own_access(self, client, acme):
        """Somebody who may assign admins still cannot give more than they hold."""
        giver = giver_holding(acme, GIVER)
        client.force_authenticate(user=giver.user)

        response = assign(client, acme, [member(acme)], ORGANISATION_ADMIN_ROLE)

        assert response.status_code == 403
        assert response.json()["code"] == "role_beyond_own_access"

    def test_a_role_within_the_givers_access_is_fine(self, client, acme):
        giver = giver_holding(acme, [*GIVER, *APPLICATION_ADMIN])
        role = custom_role(acme)
        client.force_authenticate(user=giver.user)

        assert assign(client, acme, [member(acme)], role.code).status_code == 200

    def test_an_organization_admin_may_make_another_one(self, client, acme):
        """The owner's choice (b): Organization Admin holds all of its own permissions."""
        ravi = member(acme, "ravi@acme.test")
        assign(client, acme, [ravi], ORGANISATION_ADMIN_ROLE)
        client.force_authenticate(user=ravi.user)

        response = assign(client, acme, [member(acme, "meena@acme.test")], ORGANISATION_ADMIN_ROLE)

        assert response.status_code == 200

    def test_grantable_follows_the_viewer(self, client, acme):
        role = custom_role(acme)
        giver = giver_holding(acme, [*GIVER, *APPLICATION_ADMIN])

        as_owner = {r["code"]: r["grantable"] for r in client.get(url(acme, "panel-roles/")).json()}
        client.force_authenticate(user=giver.user)
        as_giver = {r["code"]: r["grantable"] for r in client.get(url(acme, "panel-roles/")).json()}

        assert as_owner["owner"] is False
        assert as_owner[ORGANISATION_ADMIN_ROLE] is True
        assert as_giver[ORGANISATION_ADMIN_ROLE] is False
        assert as_giver[role.code] is True


class TestPermissions:
    def test_it_needs_assign_admin(self, client, acme):
        giver = giver_holding(acme, ["admin.admin.view", "admin.user.view", *APPLICATION_ADMIN])
        client.force_authenticate(user=giver.user)

        response = assign(client, acme, [member(acme)], custom_role(acme).code)

        assert response.status_code == 403

    def test_it_needs_the_users_list_beside_it(self, client, acme):
        """The page picks people from the Users list (as Assign users does, C87)."""
        giver = giver_holding(
            acme, ["admin.admin.view", "admin.admin.assign_admin", *APPLICATION_ADMIN]
        )
        client.force_authenticate(user=giver.user)

        response = assign(client, acme, [member(acme)], custom_role(acme).code)

        assert response.status_code == 403

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
        client.force_authenticate(user=user)

        assert assign(client, acme, [member(acme)], custom_role(acme).code).status_code == 403


class TestTenantIsolation:
    def test_another_organisations_role_is_not_found(self, client, acme):
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        theirs = custom_role(other, code="admin.custom_theirs")

        response = assign(client, acme, [member(acme)], theirs.code)

        assert response.status_code == 404

    def test_another_organisations_person_is_not_found(self, client, acme):
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        stranger = plain_member(other, "stranger@other.test")

        response = assign(client, acme, [stranger], ORGANISATION_ADMIN_ROLE)

        assert response.status_code == 404
        assert admin_role_of(fresh(stranger)) is None
