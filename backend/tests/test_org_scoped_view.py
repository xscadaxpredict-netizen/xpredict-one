"""
`OrgScopedAPIView`: the check cannot be skipped, and the handler never runs
without it (C49).

WHY THIS FILE EXISTS. The membership check used to be a function each view
called, and forgetting it produced an endpoint any signed-in stranger could
read -- while the tests passed, because you naturally test as a member. These
tests are written from the opposite direction: they assert what happens to
people who should be refused, and that the handler body is never reached.

THE SPY IS THE POINT. Every refusal test asserts `handler_calls == []`. A 404
with the handler having already run is not a refusal -- it would mean the view
had touched the tenant database, loaded rows and then thrown them away, and the
next endpoint to get this wrong would leak instead of refusing.

It routes a view of its own rather than using `ProvisioningView`, because the
rule belongs to the base class and should be tested without a real endpoint's
behaviour in the way. The path still has to start `/api/v1/orgs/<slug>/` --
that prefix is what the tenant middleware matches on.
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
from core.organizations.api.base import REQUEST_ORGANIZATION_ATTR, OrgScopedAPIView
from core.organizations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationStatus,
)

# `pytest.mark.urls` is pytest-django's way to swap ROOT_URLCONF for a module.
# `override_settings` cannot go in `pytestmark` -- pytest wants Mark objects
# there and rejects anything else at collection time.
pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
    pytest.mark.urls(__name__),
]

# Every call that reached a handler body, in order. Reset per test.
handler_calls: list[str] = []


class SpyView(OrgScopedAPIView):
    # Membership alone, so these tests exercise the membership check without a
    # permission check also standing in the way. The permission layer has its
    # own file.
    required_permissions: ClassVar[list[str]] = []

    def get(self, request: Request, org_slug: str) -> Response:
        handler_calls.append(self.organization.slug)
        return Response(
            {
                "slug": self.organization.slug,
                # Proves the public accessor is the organization itself and not
                # a copy or an id the view then has to look up again.
                "name": self.organization.name,
            }
        )


class LeakyView(OrgScopedAPIView):
    """
    A view trying to reach the organization the old way.

    `request.organization` was the public route until C49 and is now absent, so
    this raises `AttributeError` -> 500. That is deliberate: loud is the right
    failure for code that skipped the check, and the alternative -- leaving the
    attribute in place -- is a silent bypass sitting there for somebody to use.
    """

    required_permissions: ClassVar[list[str]] = []

    def get(self, request: Request, org_slug: str) -> Response:
        return Response({"slug": request.organization.slug})  # type: ignore[attr-defined]


urlpatterns = [
    path("api/v1/orgs/<slug:org_slug>/spy/", SpyView.as_view()),
    path("api/v1/orgs/<slug:org_slug>/leaky/", LeakyView.as_view()),
]


@pytest.fixture(autouse=True)
def _reset_spy():
    handler_calls.clear()
    yield
    handler_calls.clear()


def make_org(slug="acme-motors", status=OrganizationStatus.ACTIVE) -> Organization:
    return Organization.objects.create(
        name=f"Org {slug}",
        slug=slug,
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=status,
    )


def make_member(organization, email="person@acme.test", status=MembershipStatus.ACTIVE):
    user = User.objects.create_user(email=email, password="x")
    Membership.objects.create(
        user=user, organization=organization, role=MembershipRole.MEMBER, status=status
    )
    return user


@pytest.fixture
def client() -> APIClient:
    return APIClient()


class TestAMemberGetsThrough:
    def test_the_handler_runs_and_sees_the_organization(self, client):
        organization = make_org()
        client.force_authenticate(user=make_member(organization))

        response = client.get("/api/v1/orgs/acme-motors/spy/")

        assert response.status_code == 200
        assert response.json() == {"slug": "acme-motors", "name": "Org acme-motors"}
        assert handler_calls == ["acme-motors"]


class TestRefusalsNeverReachTheHandler:
    """
    Each of these asserts the status AND that the handler body never ran.
    """

    def test_a_stranger_is_404_and_the_handler_does_not_run(self, client):
        make_org()
        stranger = User.objects.create_user(email="stranger@elsewhere.test", password="x")
        client.force_authenticate(user=stranger)

        response = client.get("/api/v1/orgs/acme-motors/spy/")

        assert response.status_code == 404
        assert handler_calls == []

    def test_an_anonymous_caller_is_401_and_the_handler_does_not_run(self, client):
        make_org()

        response = client.get("/api/v1/orgs/acme-motors/spy/")

        assert response.status_code == 401
        assert handler_calls == []

    def test_an_unknown_slug_is_404_and_the_handler_does_not_run(self, client):
        user = User.objects.create_user(email="nobody@acme.test", password="x")
        client.force_authenticate(user=user)

        response = client.get("/api/v1/orgs/not-a-customer/spy/")

        assert response.status_code == 404
        assert handler_calls == []

    def test_a_suspended_organization_is_404_and_the_handler_does_not_run(self, client):
        organization = make_org(status=OrganizationStatus.SUSPENDED)
        client.force_authenticate(user=make_member(organization))

        response = client.get("/api/v1/orgs/acme-motors/spy/")

        assert response.status_code == 404
        assert handler_calls == []

    def test_a_disabled_membership_is_404_and_the_handler_does_not_run(self, client):
        organization = make_org()
        user = make_member(organization, status=MembershipStatus.DISABLED)
        client.force_authenticate(user=user)

        response = client.get("/api/v1/orgs/acme-motors/spy/")

        assert response.status_code == 404
        assert handler_calls == []


class TestNobodyCanTellWhichOrganizationsExist:
    def test_a_stranger_gets_the_same_answer_for_a_real_and_a_fake_slug(self, client):
        make_org()
        stranger = User.objects.create_user(email="stranger@elsewhere.test", password="x")
        client.force_authenticate(user=stranger)

        real = client.get("/api/v1/orgs/acme-motors/spy/")
        fake = client.get("/api/v1/orgs/not-a-customer/spy/")

        assert real.status_code == fake.status_code == 404
        assert real.json()["code"] == fake.json()["code"]

    def test_an_anonymous_caller_gets_the_same_answer_for_both(self, client):
        make_org()

        real = client.get("/api/v1/orgs/acme-motors/spy/")
        fake = client.get("/api/v1/orgs/not-a-customer/spy/")

        assert real.status_code == fake.status_code == 401


class TestTheOldRouteIsGone:
    def test_reading_request_organization_fails_loudly(self, client):
        """
        `request.organization` was the public route until C49. It is absent
        now, so code reaching for it raises rather than quietly bypassing the
        membership check.

        500, not 404: this is a programming error, not a refusal, and softening
        it would hide exactly the mistake the base class exists to prevent.

        The AttributeError does not escape to the caller --- `api_exception_handler`
        catches anything it does not recognise and answers an OPAQUE 500, with
        the real traceback in the log under a trace_id. So the assertion is on
        the status and on the body saying nothing, which is also C9's "a 5xx
        body carries no detail" holding here.
        """
        organization = make_org()
        client.force_authenticate(user=make_member(organization))

        response = client.get("/api/v1/orgs/acme-motors/leaky/")

        assert response.status_code == 500
        body = response.json()
        assert body["code"] == "internal_error"
        assert body["detail"] == "An unexpected error occurred."
        # Nothing about the attribute, the view or the organisation leaks out.
        assert "organization" not in str(body).lower()
        assert "attributeerror" not in str(body).lower()
        assert handler_calls == []

    def test_the_organization_is_stowed_under_the_private_name(self):
        """
        Pins the contract between the middleware and the base view. If one side
        renames the attribute, `self.organization` silently becomes None and
        every org-scoped endpoint answers 404 -- which looks like a permissions
        bug and is not one.
        """
        assert REQUEST_ORGANIZATION_ATTR.startswith("_")
