"""
`GET /api/v1/orgs/<slug>/admin/admins/` -- the Admin panel's Admins tab
(C78, Admins and Roles -> Admins), on its own permission (C79).

The organisation's owner and its organisation admins -- active or deactivated
(nobody is invited AS an admin since C83) -- with the apps they manage. Gated
on `admin.admin.view`, NOT the Users list's `admin.user.view`: the server
checks what the screen does.
"""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    ActivationCode,
    Invitation,
    Membership,
    MembershipStatus,
    Territory,
    TerritoryKind,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

URL = "/api/v1/orgs/{slug}/admin/admins/"
PANEL_ROLES_URL = "/api/v1/orgs/{slug}/admin/panel-roles/"
USERS_URL = "/api/v1/orgs/{slug}/admin/users/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    # Signup subscribes DMS.
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def person(result, *, app, role, place=None, email, first="", status=MembershipStatus.ACTIVE):
    user = User.objects.create_user(email=email, password="x", first_name=first)
    membership = Membership.objects.create(
        user=user, organization=result.organization, status=status
    )
    grant_app_access(
        membership=membership,
        app=app,
        role=role,
        territories=[place or Territory.objects.root_for(result.organization, app)],
    )
    return membership


def admin(result, *, email, first="", status=MembershipStatus.ACTIVE):
    return person(
        result,
        app=AppCode.ADMIN,
        role=Role.objects.get(code="admin.org_admin"),
        email=email,
        first=first,
        status=status,
    )


def dealer(result, name="Delhi"):
    return Territory.objects.create(
        organization=result.organization, kind=TerritoryKind.DEALER, name=name
    )


def invite(result, *, email):
    """A pending person (C83): nobody is invited AS an admin."""
    return Invitation.objects.create(
        organization=result.organization,
        email=email,
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )


def rows(client, result, user=None):
    client.force_authenticate(user=user or result.user)
    response = client.get(URL.format(slug=result.organization.slug))
    assert response.status_code == 200
    return response.json()


def emails(client, result, user=None):
    return [row["email"] for row in rows(client, result, user)]


class TestWhoIsListed:
    def test_the_owner_first_then_admins_in_the_order_they_were_added(self, client):
        result = found()
        admin(result, email="first@acme.test")
        admin(result, email="second@acme.test")

        assert emails(client, result) == [
            "owner@acme.test",
            "first@acme.test",
            "second@acme.test",
        ]

    def test_deactivated_admins_are_listed_with_their_status(self, client):
        result = found()
        admin(result, email="off@acme.test", status=MembershipStatus.DISABLED)

        by_email = {row["email"]: row for row in rows(client, result)}

        assert by_email["owner@acme.test"]["status"] == "active"
        assert by_email["off@acme.test"]["status"] == "disabled"
        assert {row["role"] for row in by_email.values()} == {"owner", "admin"}
        assert by_email["owner@acme.test"]["role"] == "owner"

    def test_never_a_member_or_a_dealer_admin(self, client):
        """
        A dealer admin holds `admin.*` permissions through DMS System
        administrator, but no Administration grant: they run one dealership,
        not the organisation.
        """
        result = found()
        delhi = dealer(result)
        person(
            result,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.system_admin"),
            place=delhi,
            email="da@acme.test",
        )
        person(
            result,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.manager"),
            place=delhi,
            email="m@acme.test",
        )
        # A pending person neither: nobody is invited as an admin (C83).
        invite(result, email="pending@acme.test")

        assert emails(client, result) == ["owner@acme.test"]

    def test_never_another_organisations_people(self, client):
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        admin(other, email="their-admin@other.test")

        assert emails(client, found()) == ["owner@acme.test"]

    def test_the_owner_is_listed_once_as_owner_whatever_grants_they_hold(self, client):
        result = found()
        grant_app_access(
            membership=result.membership,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
        )

        listed = rows(client, result)

        assert [(row["email"], row["role"]) for row in listed] == [("owner@acme.test", "owner")]


class TestTheFields:
    def test_exactly_what_admins_ts_declares(self, client):
        listed = rows(client, found())

        assert set(listed[0]) == {
            "id",
            "first_name",
            "last_name",
            "email",
            "role",
            "admin_role",
            "status",
            "apps_managed",
        }
        assert set(listed[0]["apps_managed"][0]) == {"code", "name"}

    def test_a_row_is_identified_by_the_membership(self, client):
        result = found()
        them = admin(result, email="admin@acme.test", first="Priya")

        row = rows(client, result)[-1]

        assert row["id"] == str(them.id)
        assert row["first_name"] == "Priya"

    def test_apps_managed_are_the_active_apps_in_order_for_every_row(self, client):
        result = found()
        AppSubscription.objects.create(
            organization=result.organization, app_id=AppCode.CRM, status=SubscriptionStatus.ACTIVE
        )
        AppSubscription.objects.create(
            organization=result.organization,
            app_id=AppCode.ECOMMERCE,
            status=SubscriptionStatus.CANCELLED,
        )
        admin(result, email="admin@acme.test")

        for row in rows(client, result):
            assert row["apps_managed"] == [
                {"code": "dms", "name": "DMS"},
                {"code": "crm", "name": "CRM"},
            ]


class TestAgreesWithTheRolesTab:
    def test_the_rows_are_the_people_the_roles_tab_counts(self, client):
        result = found()
        admin(result, email="a@acme.test")
        admin(result, email="b@acme.test", status=MembershipStatus.DISABLED)
        invite(result, email="c@acme.test")

        listed = rows(client, result)
        counts = {
            role["name"]: role["users"]
            for role in client.get(PANEL_ROLES_URL.format(slug=result.organization.slug)).json()
        }

        assert sum(row["role"] == "owner" for row in listed) == counts["Organization Owner"]
        assert sum(row["role"] == "admin" for row in listed) == counts["Organization Admin"] == 2


class TestTheCost:
    def test_it_costs_the_same_however_many_admins(self, client):
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

        assert emails(client, result, user=them.user) == ["owner@acme.test", "admin@acme.test"]

    def test_admins_view_alone_is_enough_without_the_users_list(self, client):
        """
        THE POINT OF THIS ENDPOINT. A role holding the Admins tab's view and
        not Users' (possible once organisations build roles, C72 piece 5)
        lists the admins -- and is still refused the Users list.
        """
        result = found()
        role = Role.objects.create(
            code="dms.test_admins_viewer",
            name="Admins viewer",
            app_id=AppCode.DMS,
            level="org",
            summary="Made up for a test.",
        )
        RolePermission.objects.create(
            role=role, permission=Permission.objects.get(code="admin.admin.view")
        )
        them = person(result, app=AppCode.DMS, role=role, email="viewer@acme.test")

        assert emails(client, result, user=them.user) == ["owner@acme.test"]
        users = client.get(USERS_URL.format(slug=result.organization.slug))
        assert users.status_code == 403

    def test_a_dealer_admin_may_not(self, client):
        result = found()
        them = person(
            result,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.system_admin"),
            place=dealer(result),
            email="da@acme.test",
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

    def test_its_only_write_is_assign_admin(self, client):
        """
        POST is Assign Admin (`admin.admin.assign_admin`, named in
        `method_permissions`, C81 -- tested in `test_assign_admin.py`); nothing
        else writes here.
        """
        result = found()
        client.force_authenticate(user=result.user)
        url = URL.format(slug=result.organization.slug)

        for send in (client.put, client.patch, client.delete):
            assert send(url).status_code == 405
