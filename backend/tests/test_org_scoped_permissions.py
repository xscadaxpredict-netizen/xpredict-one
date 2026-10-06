"""
The permission link of the authorization chain (C49's second link).

`test_org_scoped_view.py` covers the first link -- do you belong here at all.
This file covers the next one: do you hold the capability, and is the refusal
the right KIND of refusal.

THE DISTINCTION THESE TESTS EXIST TO PIN. Scope failures are 404, because a
record outside your scope must be indistinguishable from one that never
existed. Capability failures are 403, because the caller is openly entitled to
be in this organization and the answer to this particular action is still no.
Collapsing the two either leaks (403 on a record they cannot see) or confuses
(404 for something they can see and may not touch).

IT ALSO PINS THE LOUD DEFAULT. A view that never declares
`required_permissions` raises instead of permitting everybody -- the one
behaviour that makes the mechanism trustworthy, because forgetting becomes a
500 on the first request rather than a hole found by whoever probes for it.

The views here are local to the test module for the same reason
`test_org_scoped_view.py` routes its own: the rule belongs to the base class
and is clearer without a real endpoint's behaviour in the way.
"""

from __future__ import annotations

from typing import ClassVar

import pytest
from django.urls import path
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Membership,
    MembershipRole,
)
from core.organizations.selectors import can_manage, permissions_for
from core.organizations.services import sign_up
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
    pytest.mark.urls(__name__),
]

# Every handler body that ran, in order. A refusal must leave this empty: a
# 403 after the handler has already queried is not a refusal, it is a leak
# that happened to discard its result.
handler_calls: list[str] = []


class NeedsDealerCreate(OrgScopedAPIView):
    required_permissions: ClassVar[list[str]] = ["admin.dealer.create"]

    def get(self, request: Request, org_slug: str) -> Response:
        handler_calls.append("dealer-create")
        return Response({"ok": True})


class NeedsTwoPermissions(OrgScopedAPIView):
    """`required_permissions` is an AND. Holding one of these is not enough."""

    required_permissions: ClassVar[list[str]] = [
        "admin.dealer.create",
        "admin.person.invite",
    ]

    def get(self, request: Request, org_slug: str) -> Response:
        handler_calls.append("two")
        return Response({"ok": True})


class NeedsAnyOf(OrgScopedAPIView):
    required_permissions: ClassVar[list[str]] = []
    required_any_permission: ClassVar[list[str]] = [
        "admin.role.view",
        "admin.person.invite",
    ]

    def get(self, request: Request, org_slug: str) -> Response:
        handler_calls.append("any-of")
        return Response({"ok": True})


class ForgotToDeclare(OrgScopedAPIView):
    """Somebody wrote a view and never answered the question."""

    def get(self, request: Request, org_slug: str) -> Response:
        handler_calls.append("forgot")
        return Response({"ok": True})


urlpatterns = [
    path("api/v1/orgs/<slug:org_slug>/needs-dealer-create/", NeedsDealerCreate.as_view()),
    path("api/v1/orgs/<slug:org_slug>/needs-two/", NeedsTwoPermissions.as_view()),
    path("api/v1/orgs/<slug:org_slug>/needs-any/", NeedsAnyOf.as_view()),
    path("api/v1/orgs/<slug:org_slug>/forgot/", ForgotToDeclare.as_view()),
]


@pytest.fixture(autouse=True)
def _reset_spy():
    handler_calls.clear()
    yield
    handler_calls.clear()


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Motors", email="owner@acme.test", code="CODE-ACME"):
    """
    A real organization through the real service, so standing, the owner
    marker, the subscription and the owner's app access are all consistent --
    hand-built rows drift from what signup actually produces.
    """
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


def add_dealer_admin(organization, unit, email="dealeradmin@acme.test"):
    """
    `member` standing plus a dealership plus the DMS System administrator role
    (C40). Not `admin` standing -- the check constraint refuses that with a
    unit attached, which is the point of the shape.
    """
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(
        user=user, organization=organization, unit=unit, role=MembershipRole.MEMBER
    )
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app=AppCode.DMS, code="dms.system_admin"),
    )
    return user, membership


def add_plain_member(organization, unit=None, email="sales@acme.test"):
    """A Sales representative: entitled to be here, administers nothing."""
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(
        user=user, organization=organization, unit=unit, role=MembershipRole.MEMBER
    )
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app=AppCode.DMS, code="dms.sales_representative"),
    )
    return user, membership


class TestPermissionsFor:
    """
    `permissions_for()` must agree with what `/me` reports, because the guards
    and the launcher asking different questions is how a button appears for
    somebody the endpoint then refuses -- or worse, the reverse.
    """

    def test_an_owner_holds_every_admin_permission(self):
        result = found()
        membership = Membership.objects.get(user=result.user, organization=result.organization)

        held = permissions_for(membership)

        assert "admin.dealer.create" in held
        assert "admin.person.invite" in held
        assert "admin.role.view" in held

    def test_a_dealer_admin_holds_the_people_permissions_and_not_the_dealer_ones(self):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_dealer_admin(result.organization, unit)

        held = permissions_for(membership)

        # They manage their own dealership's people...
        assert "admin.person.view" in held
        assert "admin.person.invite" in held
        # ...and cannot create or close a dealership, which is the
        # organization's job (C23). This is the privilege test the plan asks
        # for, at the permission layer.
        assert "admin.dealer.create" not in held
        assert "admin.dealer.set_status" not in held
        # And they do not reach the Roles reference page, which is why the
        # roles endpoint accepts `admin.person.invite` as well (Q35).
        assert "admin.role.view" not in held

    def test_a_sales_representative_holds_no_admin_permission_at_all(self):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_plain_member(result.organization, unit)

        held = permissions_for(membership)

        assert not {code for code in held if code.startswith("admin.")}
        # They do hold their own job's permissions, so this is not an empty
        # set for the wrong reason.
        assert "dms.enquiry.create" in held


class TestCanManage:
    """
    Scope, and scope only. Capability is a separate question (see the view
    tests below) and both are required.
    """

    def test_an_organization_wide_admin_manages_everybody(self):
        result = found()
        owner = Membership.objects.get(user=result.user, organization=result.organization)
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")

        assert can_manage(owner, None) is True
        assert can_manage(owner, unit.id) is True

    def test_a_dealer_admin_manages_their_own_dealership_only(self):
        result = found()
        mine = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        theirs = BusinessUnit.objects.create(organization=result.organization, name="Guindy")
        _, membership = add_dealer_admin(result.organization, mine)

        assert can_manage(membership, mine.id) is True
        assert can_manage(membership, theirs.id) is False

    def test_a_dealer_admin_cannot_manage_an_organization_wide_person(self):
        """
        The case that is easy to get backwards. `None` is not "no restriction"
        here -- it describes the TARGET, somebody senior to a dealer admin
        whose scope they do not share.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_dealer_admin(result.organization, unit)

        assert can_manage(membership, None) is False


class TestTheViewLayer:
    def test_a_permitted_caller_reaches_the_handler(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/needs-dealer-create/")

        assert response.status_code == 200
        assert handler_calls == ["dealer-create"]

    def test_a_member_without_the_permission_gets_403_and_the_handler_never_runs(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_plain_member(result.organization, unit)
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/needs-dealer-create/")

        # 403, NOT 404. They are a member of this organization and that is not
        # a secret from them; what they may not do is create a dealership.
        assert response.status_code == 403
        assert response.json()["code"] == "not_permitted"
        assert handler_calls == []

    def test_a_dealer_admin_is_refused_an_organization_level_capability(self, client):
        """
        The privilege test from the plan, through HTTP: a dealer admin cannot
        create dealers, however many people permissions they hold.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/needs-dealer-create/")

        assert response.status_code == 403
        assert handler_calls == []

    def test_required_permissions_is_an_and_not_an_or(self, client):
        """
        A dealer admin holds `admin.person.invite` and not
        `admin.dealer.create`. If the base class ever loosened to "any of",
        this is the test that catches it.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/needs-two/")

        assert response.status_code == 403
        assert handler_calls == []

    def test_required_any_permission_accepts_either(self, client):
        """
        The dealer admin holds `admin.person.invite` but not
        `admin.role.view`, and must still get through -- which is exactly the
        role-catalogue case.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/needs-any/")

        assert response.status_code == 200
        assert handler_calls == ["any-of"]

    def test_required_any_permission_still_refuses_somebody_holding_neither(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_plain_member(result.organization, unit)
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/needs-any/")

        assert response.status_code == 403
        assert handler_calls == []

    def test_a_view_that_never_declared_its_permissions_is_a_500_not_an_open_door(self, client):
        """
        THE LOUD DEFAULT. An undeclared `required_permissions` must not mean
        "everybody" -- it means nobody said, and that is a bug in the view.

        It surfaces as a **500**, not as a refusal, and both halves matter.
        `ImproperlyConfigured` is a configuration error rather than a domain
        one, so `config/exception_handler.py` takes its generic branch: the
        body carries no detail (C9) while the logs get the class name and a
        stack trace. A 403 would have been worse in a way that is easy to
        miss -- it reads like a real permission decision, so whoever hit it
        would go looking for the missing grant instead of the missing
        declaration.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/forgot/")

        assert response.status_code == 500
        # Not 403: this is not a decision about the caller.
        assert response.status_code != 403
        # The body says nothing about why, because a 5xx never does (C9).
        assert "required_permissions" not in response.content.decode()
        assert handler_calls == []
