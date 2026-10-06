"""
`GET /api/v1/orgs/<slug>/admin/roles/` -- the role catalogue.

WRITTEN AGAINST THE DECISIONS, NOT THE CATALOGUE. Asserting that the response
matches whatever `catalogue.py` currently holds would pass for any content at
all, including an empty list, so the counts and the names are spelled out:
nine roles (C35, C36), exactly one of which administers (C36 split that away
from Manager), and `administers` derived rather than stored (C40, C44).

THE INTERESTING TEST IS THE DEALER ADMIN. They hold `admin.person.invite` and
not `admin.role.view`, so gating this endpoint on `admin.role.view` alone -- the
obvious reading -- would have given them an invite form with an empty role
picker and no error to explain it (Q35).
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Membership,
    MembershipRole,
)
from core.organizations.services import sign_up
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

ROLES_URL = "/api/v1/orgs/{slug}/admin/roles/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Motors", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    result = sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )
    # NO `db_name` OVERRIDE, unlike the provisioning tests. Administration is
    # control-plane only -- memberships, roles and permissions all live in the
    # control database -- so nothing here ever opens a tenant connection and
    # the alias the suite declares is never reached. Pointing two organizations
    # at it would also fail outright: `db_name` is unique.
    return result


def add_with_role(organization, role_code, unit=None, email="person@acme.test"):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(
        user=user, organization=organization, unit=unit, role=MembershipRole.MEMBER
    )
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app=AppCode.DMS, code=role_code),
    )
    return user


class TestTheCatalogue:
    def test_an_owner_gets_every_built_in_role(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        body = response.json()
        # Nine: seven DMS (C35) plus two org-level, plus CRM's single default.
        assert len(body) == Role.objects.count() == 9

    def test_the_fields_are_exactly_what_roles_ts_declares(self, client):
        """
        The hand-written `Role` interface in `shell/admin/api/roles.ts` is the
        other half of this contract and nothing checks that the two agree
        (C43 removed the generated client). A field renamed here is a silently
        empty picker there, so the key set is pinned.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        assert set(response.json()[0]) == {
            "code",
            "name",
            "app",
            "level",
            "summary",
            "administers",
        }

    def test_system_administrator_is_the_only_role_that_administers(self, client):
        """
        C36 split administering away from Manager, and C40 made it derived --
        "does this role grant any `admin.*` permission" -- so this assertion
        is really about the join, not about a column somebody set.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        administering = [role["code"] for role in response.json() if role["administers"]]
        assert administering == ["dms.system_admin"]

    def test_the_dealership_roles_come_back_in_the_order_they_are_meant_to_be_read(
        self, client
    ):
        """
        THE ALPHABET GETS THIS WRONG, which is why `display_order` exists.

        Sorting by name gives Manager, Sales representative, Service advisor,
        System administrator, Tech support, Technician -- which separates the
        two roles that RUN a dealership (C36 split them deliberately, so they
        belong side by side) and puts "Tech support" before "Technician",
        reading like a mistake.

        `rolesFor()` in `roles.ts` preserves whatever order the server sends,
        so this list IS what the picker shows. The frontend test
        `dealerScope.test.tsx` pinned it before the endpoint existed; this is
        the same assertion from the other side of the wire.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        dms_unit = [
            role["name"]
            for role in response.json()
            if role["app"] == "dms" and role["level"] == "unit"
        ]
        assert dms_unit == [
            "Manager",
            "System administrator",
            "Sales representative",
            "Service advisor",
            "Technician",
            "Tech support",
        ]

    def test_the_catalogue_does_not_cost_a_query_per_role(
        self, client, django_assert_max_num_queries
    ):
        """
        `Role.administers` walks `permissions`, so without the prefetch in
        `role_catalogue()` this endpoint issues a query per role and gets
        slower every time a role is added. Nine roles today, so the N+1 is
        cheap enough to go unnoticed -- which is exactly why it is pinned
        here rather than left to somebody profiling later.

        The budget covers the request as a whole, including the base class's
        membership and permission lookups. It is deliberately a ceiling and
        not an exact count: asserting an exact number makes this test fail for
        anybody who adds an unrelated query, which trains people to raise the
        number without reading it.
        """
        result = found()
        client.force_authenticate(user=result.user)
        url = ROLES_URL.format(slug=result.organization.slug)

        with django_assert_max_num_queries(12):
            client.get(url)


class TestWhoMayAsk:
    def test_a_dealer_admin_gets_the_catalogue_without_admin_role_view(self, client):
        """
        THE Q35 CASE. A dealer admin assigns roles at their own dealership and
        never sees the Roles reference page, so they need the names and not the
        page. `admin.person.invite` is what lets them through.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user = add_with_role(
            result.organization, "dms.system_admin", unit=unit, email="da@acme.test"
        )
        client.force_authenticate(user=user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        assert len(response.json()) == 9

    def test_a_sales_representative_is_refused_with_403(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user = add_with_role(
            result.organization, "dms.sales_representative", unit=unit, email="sales@acme.test"
        )
        client.force_authenticate(user=user)

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        # 403 and not 404: they are openly a member of this organization, and
        # the role catalogue is simply not theirs to read.
        assert response.status_code == 403
        assert response.json()["code"] == "not_permitted"

    def test_an_anonymous_caller_gets_401(self, client):
        result = found()

        response = client.get(ROLES_URL.format(slug=result.organization.slug))

        assert response.status_code == 401

    def test_somebody_from_another_organization_gets_404(self, client):
        """
        Tenant isolation, at the entitlement layer. 404 rather than 403 so a
        slug cannot be used to find out which companies are customers (C49) --
        and the answer is identical for a slug that does not exist at all.
        """
        theirs = found()
        mine = found(name="Northway Auto", email="owner@northway.test", code="CODE-NORTH")
        client.force_authenticate(user=mine.user)

        response = client.get(ROLES_URL.format(slug=theirs.organization.slug))

        assert response.status_code == 404

        # AND INDISTINGUISHABLE FROM A SLUG THAT DOES NOT EXIST, which is the
        # half that actually closes the leak -- a 404 is no use if the two
        # refusals read differently.
        #
        # `instance` and `trace_id` are excluded because they MUST differ:
        # `instance` echoes the path the caller already knows they asked for,
        # and `trace_id` is unique per request by design. Everything that
        # describes the refusal itself has to match.
        fictional = client.get(ROLES_URL.format(slug="no-such-company"))
        assert fictional.status_code == 404

        def without_request_specifics(body: dict) -> dict:
            return {k: v for k, v in body.items() if k not in {"instance", "trace_id"}}

        assert without_request_specifics(fictional.json()) == without_request_specifics(
            response.json()
        )
