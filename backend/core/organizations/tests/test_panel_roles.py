"""
`GET /api/v1/orgs/<slug>/admin/panel-roles/` -- the Admin panel's Roles tab
(C78, Admins and Roles -> Roles).

The two Admin panel roles, Organization Owner and Organization Admin, each with
how many people hold it. App roles are NOT listed (the owner, 2026-11-18: DMS's
roles belong to DMS's own settings). Gated on `admin.role.view`.

USERS COUNTS EVERYONE HOLDING THE ROLE: active and deactivated. Nobody is
invited as an admin since C83, so a pending person never counts.
"""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Invitation,
    Membership,
    MembershipStatus,
    Territory,
    TerritoryKind,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

URL = "/api/v1/orgs/{slug}/admin/panel-roles/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def person(result, *, app, role_code, place=None, email, status=MembershipStatus.ACTIVE):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(
        user=user, organization=result.organization, status=status
    )
    grant_app_access(
        membership=membership,
        app=app,
        role=Role.objects.get(code=role_code),
        territories=[place or Territory.objects.root_for(result.organization)],
    )
    return membership


def admin(result, *, email, status=MembershipStatus.ACTIVE):
    return person(
        result, app=AppCode.ADMIN, role_code="admin.org_admin", email=email, status=status
    )


def invite(result, *, email):
    """A pending person (C83): no role -- nobody is invited AS an admin."""
    return Invitation.objects.create(
        organization=result.organization,
        email=email,
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )


def body(client, result, user=None):
    client.force_authenticate(user=user or result.user)
    response = client.get(URL.format(slug=result.organization.slug))
    assert response.status_code == 200
    return response.json()


def users_of(client, result):
    return {row["name"]: row["users"] for row in body(client, result)}


class TestTheList:
    def test_only_the_admin_panel_roles_never_an_app_role(self, client):
        rows = body(client, found())

        assert [row["name"] for row in rows] == ["Organization Owner", "Organization Admin"]
        assert [row["code"] for row in rows] == ["owner", "admin.org_admin"]

    def test_the_fields_are_exactly_what_roles_ts_declares(self, client):
        rows = body(client, found())

        assert set(rows[0]) == {"code", "name", "summary", "built_in", "users", "modified_by"}

    def test_both_are_built_in_and_nobody_has_modified_them(self, client):
        rows = body(client, found())

        assert all(row["built_in"] is True for row in rows)
        assert all(row["modified_by"] is None for row in rows)

    def test_the_admin_summary_is_the_roles_own(self, client):
        rows = body(client, found())

        assert rows[1]["summary"] == Role.objects.get(code="admin.org_admin").summary


class TestUsers:
    def test_the_owner_is_one_and_a_new_organisation_has_no_admins(self, client):
        assert users_of(client, found()) == {"Organization Owner": 1, "Organization Admin": 0}

    def test_admins_count_active_and_deactivated(self, client):
        result = found()
        admin(result, email="active@acme.test")
        admin(result, email="off@acme.test", status=MembershipStatus.DISABLED)

        assert users_of(client, result)["Organization Admin"] == 2

    def test_a_pending_person_is_never_counted(self, client):
        """Nobody is invited as an admin any more (C83); an admin is made once joined."""
        result = found()
        invite(result, email="pending@acme.test")

        assert users_of(client, result) == {"Organization Owner": 1, "Organization Admin": 0}

    def test_members_and_dealer_admins_are_not_organisation_admins(self, client):
        """
        A dealer admin holds `admin.*` permissions through DMS System
        administrator, but no Administration grant -- they are not an
        Organization Admin, and neither is a pending member.
        """
        result = found()
        delhi = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        person(
            result, app=AppCode.DMS, role_code="dms.system_admin", place=delhi, email="da@acme.test"
        )
        person(result, app=AppCode.DMS, role_code="dms.manager", place=delhi, email="m@acme.test")

        assert users_of(client, result)["Organization Admin"] == 0

    def test_the_owner_is_never_counted_as_an_admin(self, client):
        """`standing()` says owner first, whatever grants they hold -- so here."""
        result = found()
        owner = Membership.objects.get(organization=result.organization, is_owner=True)
        grant_app_access(
            membership=owner,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[Territory.objects.root_for(result.organization)],
        )

        assert users_of(client, result) == {"Organization Owner": 1, "Organization Admin": 0}

    def test_another_organisations_admins_are_not_counted(self, client):
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        admin(other, email="their-admin@other.test")

        # Both numbers: the other organisation's OWNER must not count either.
        assert users_of(client, found()) == {"Organization Owner": 1, "Organization Admin": 0}

    def test_it_costs_the_same_however_many_admins(self, client):
        """Counted in the database, never by loading each person."""
        result = found()
        client.force_authenticate(user=result.user)
        url = URL.format(slug=result.organization.slug)

        def queries():
            with CaptureQueriesContext(connection) as context:
                client.get(url)
            return len(context.captured_queries)

        admin(result, email="admin0@acme.test")
        with_one = queries()
        for index in range(1, 6):
            admin(result, email=f"admin{index}@acme.test")

        assert queries() == with_one


class TestWhoMayAsk:
    def test_an_organisation_admin_may(self, client):
        result = found()
        them = admin(result, email="admin@acme.test")

        assert len(body(client, result, user=them.user)) == 2

    def test_a_dealer_admin_may_not(self, client):
        """
        The counts are organisation-wide. A dealer admin's role picker reads
        `/admin/roles/` (Q35); this tab is not theirs.
        """
        result = found()
        delhi = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi"
        )
        them = person(
            result, app=AppCode.DMS, role_code="dms.system_admin", place=delhi, email="da@acme.test"
        )
        client.force_authenticate(user=them.user)

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    def test_a_stranger_gets_404(self, client):
        result = found()
        stranger = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        client.force_authenticate(user=stranger.user)

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 404
