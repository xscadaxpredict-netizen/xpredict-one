"""
A person is what their Admin panel role says (C89, answering Q70; the owner,
2026-11-23).

"Organization Admin" is the BUILT-IN Organisation admin role only. Somebody
holding one of the organisation's own Admin panel roles ("Application Admin")
is named, counted and listed by THAT role, and may do only what it permits --
while still reaching the whole organisation, because an Administration grant
sits at the root.

Before C89 every Administration grant counted as Organization Admin: the
Users list, `/me`, the Admins tab and the Roles tab's count would all have
called an "Application Admin" a full Organization Admin, and the Admins tab
would have said they manage every app.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import ActivationCode, Membership, Territory
from core.organizations.selectors import (
    ORGANISATION_ADMIN_ROLE,
    administers_within,
    permissions_for,
    standing,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Role

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

PASSWORD = "correct horse battery staple"
APPLICATION_ADMIN = ["admin.application.view", "admin.application.view_users"]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def acme(client):
    ActivationCode.objects.create(code="CODE-ACME")
    result = sign_up(
        activation_code="CODE-ACME",
        organization_name="Acme Water",
        email="owner@acme.test",
        password=PASSWORD,
    )
    client.force_authenticate(user=result.user)
    return result


def url(result, path):
    return f"/api/v1/orgs/{result.organization.slug}/admin/{path}"


def custom_role(client, result, name="Application Admin", permissions=None) -> str:
    response = client.post(
        url(result, "panel-roles/"),
        {"name": name, "description": "", "permissions": permissions or APPLICATION_ADMIN},
        format="json",
    )
    assert response.status_code == 201, response.json()
    return response.json()["code"]


def holding(result, code, email) -> Membership:
    """A member holding this Admin panel role, at the root -- what Assign Admin will do."""
    user = User.objects.create_user(email=email, password="x", first_name=email.split("@")[0])
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.ADMIN,
        role=Role.objects.get(code=code),
        territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
    )
    return Membership.objects.get(pk=membership.pk)


@pytest.fixture
def people(client, acme):
    """Ravi holds Organisation admin; Meena holds the organisation's own Application Admin."""
    code = custom_role(client, acme)
    ravi = holding(acme, ORGANISATION_ADMIN_ROLE, "ravi@acme.test")
    meena = holding(acme, code, "meena@acme.test")
    return code, ravi, meena


def row_of(listed, email):
    return next(row for row in listed if row["email"] == email)


class TestStanding:
    def test_only_the_built_in_role_is_organisation_admin(self, people):
        _code, ravi, meena = people

        assert standing(ravi) == "admin"
        assert standing(meena) == "member"

    def test_a_custom_role_holder_reaches_the_whole_organisation(self, people):
        """Where they act is organisation-wide; WHAT they may do is their role's."""
        _code, _ravi, meena = people

        assert administers_within(meena) is None

    def test_a_custom_role_holder_holds_only_that_roles_permissions(self, people):
        _code, _ravi, meena = people

        held = {p for p in permissions_for(meena) if p.startswith("admin.")}

        assert held == set(APPLICATION_ADMIN)


class TestTheUsersList:
    def test_each_person_is_named_by_the_role_they_hold(self, client, acme, people):
        code, _ravi, _meena = people

        listed = client.get(url(acme, "users/")).json()

        assert row_of(listed, "owner@acme.test")["admin_role"] == {
            "code": "owner",
            "name": "Organization Owner",
        }
        ravi = row_of(listed, "ravi@acme.test")
        assert (ravi["role"], ravi["admin_role"]) == (
            "admin",
            {"code": ORGANISATION_ADMIN_ROLE, "name": "Organization Admin"},
        )
        meena = row_of(listed, "meena@acme.test")
        assert (meena["role"], meena["admin_role"]) == (
            "member",
            {"code": code, "name": "Application Admin"},
        )
        # Still administers organisation-wide: the reach, not the name.
        assert meena["administers"] == "organisation"

    def test_somebody_with_no_admin_panel_role_has_none(self, client, acme):
        User.objects.create_user(email="asha@acme.test", password="x")
        Membership.objects.create(
            user=User.objects.get(email="asha@acme.test"), organization=acme.organization
        )

        listed = client.get(url(acme, "users/")).json()

        assert row_of(listed, "asha@acme.test")["admin_role"] is None

    def test_a_renamed_role_is_shown_by_its_new_name(self, client, acme, people):
        code, _ravi, _meena = people
        client.put(
            url(acme, f"panel-roles/{code}/"),
            {"name": "Apps Lead", "description": "", "permissions": APPLICATION_ADMIN},
            format="json",
        )

        listed = client.get(url(acme, "users/")).json()

        assert row_of(listed, "meena@acme.test")["admin_role"]["name"] == "Apps Lead"


class TestMe:
    def test_me_names_the_role_too(self, client, acme, people):
        code, _ravi, meena = people
        client.force_authenticate(user=meena.user)

        membership = client.get("/api/v1/me/").json()["memberships"][0]

        assert membership["role"] == "member"
        # On the admin app's own entry since 2026-11-24 (`admin_role` is gone).
        admin = next(app for app in membership["apps"] if app["key"] == "admin")
        assert admin["role"] == {"code": code, "name": "Application Admin"}
        assert "admin_role" not in membership


class TestTheRolesTabCounts:
    def test_each_role_counts_only_its_own_holders(self, client, acme, people):
        code, _ravi, _meena = people

        counts = {r["code"]: r["users"] for r in client.get(url(acme, "panel-roles/")).json()}

        assert counts == {"owner": 1, ORGANISATION_ADMIN_ROLE: 1, code: 1}


class TestTheAdminsTab:
    def test_it_lists_every_admin_panel_role_by_name(self, client, acme, people):
        code, _ravi, _meena = people

        listed = client.get(url(acme, "admins/")).json()

        assert [(r["email"], r["role"], r["admin_role"]["name"]) for r in listed] == [
            ("owner@acme.test", "owner", "Organization Owner"),
            ("ravi@acme.test", "admin", "Organization Admin"),
            ("meena@acme.test", "custom", "Application Admin"),
        ]
        assert row_of(listed, "meena@acme.test")["admin_role"]["code"] == code

    def test_a_custom_role_holder_manages_no_app(self, client, acme, people):
        """The owner's report: they were shown as managing every app."""
        listed = client.get(url(acme, "admins/")).json()

        assert row_of(listed, "meena@acme.test")["apps_managed"] == []
        assert row_of(listed, "ravi@acme.test")["apps_managed"] != []
        assert row_of(listed, "owner@acme.test")["apps_managed"] != []
