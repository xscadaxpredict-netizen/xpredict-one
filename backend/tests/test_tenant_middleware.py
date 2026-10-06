"""
Tenant resolution: what gets bound, what gets refused, and what gets reset.

`config.middleware.TenantMiddleware` is the only thing that sets
`current_tenant_db`, so the router's fail-closed behaviour is only as good as
this is. Three separate properties are tested here and they fail in different
ways:

- **Refusal** is a security property. An unknown slug and somebody else's
  organisation must be indistinguishable.
- **Binding** is a correctness property. The right database, for the right
  request.
- **Resetting** is the one that bites under load and never in development.
  Threads are reused between requests, so a contextvar left set hands the next
  request on that thread the previous tenant's database -- one customer reading
  another's data, with nothing in the logs.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationStatus,
)
from shared.base_models import allowed_units

pytestmark = pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])


def make_org(slug="acme-motors", status=OrganizationStatus.ACTIVE) -> Organization:
    # Pointed at the declared tenant alias so that registering the connection
    # cannot trip Django's "connection you never declared" guard. No test here
    # queries the tenant database -- they are about resolution, not data.
    return Organization.objects.create(
        name=slug,
        slug=slug,
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=status,
    )


def make_member(organization, email="person@acme.test", status=MembershipStatus.ACTIVE):
    user = User.objects.create_user(email=email, password="x")
    Membership.objects.create(
        user=user,
        organization=organization,
        role=MembershipRole.MEMBER,
        status=status,
    )
    return user


def url_for(organization) -> str:
    return reverse("organizations:provisioning", kwargs={"org_slug": organization.slug})


@pytest.fixture
def client() -> APIClient:
    return APIClient()


class TestRefusals:
    def test_an_unknown_slug_is_404_for_someone_signed_in(self, client):
        user = User.objects.create_user(email="nobody@acme.test", password="x")
        client.force_authenticate(user=user)

        response = client.get("/api/v1/orgs/does-not-exist/provisioning/")

        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    def test_a_suspended_organization_is_404(self, client):
        organization = make_org(status=OrganizationStatus.SUSPENDED)
        client.force_authenticate(user=make_member(organization))

        response = client.get(url_for(organization))

        # The SAME answer as an unknown slug, deliberately. Whether a named
        # organisation is suspended is their business, not a stranger's -- and
        # a different status code here would confirm it exists.
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    def test_a_non_member_is_404_and_not_403(self, client):
        """
        Cross-tenant access is 404, never 403 (C3). 403 would confirm the
        organisation exists, which turns the slug into a way to enumerate
        customers and find out when each signed up.
        """
        organization = make_org()
        outsider = User.objects.create_user(email="outsider@elsewhere.test", password="x")
        client.force_authenticate(user=outsider)

        response = client.get(url_for(organization))

        assert response.status_code == 404

    def test_a_disabled_membership_is_404(self, client):
        """
        Switched off means out, on the next request (Q17). The middleware binds
        the database and the endpoint checks membership, so this is the
        endpoint's refusal rather than the middleware's.
        """
        organization = make_org()
        user = make_member(organization, status=MembershipStatus.DISABLED)
        client.force_authenticate(user=user)

        response = client.get(url_for(organization))

        assert response.status_code == 404

    def test_an_anonymous_caller_is_401(self, client):
        """
        401, not 404: we do not know who you are, so authenticate and try
        again. That is what sends somebody to the sign-in page, where a 404
        would leave them staring at a dead screen.
        """
        organization = make_org()

        response = client.get(url_for(organization))

        assert response.status_code == 401

    def test_an_anonymous_caller_cannot_tell_a_real_slug_from_a_made_up_one(
        self, client
    ):
        """
        THE ENUMERATION LEAK, AND IT WAS REAL. Found by probing the running
        server rather than by reading code: the middleware used to answer 404
        for an unknown slug, while a real slug reached the view and answered
        401. So an anonymous caller could ask which companies are customers,
        one slug at a time.

        Middleware cannot close that by authenticating -- DRF does that inside
        the view -- so it now binds nothing and lets the request through, and
        the refusal happens after authentication. Both answers below must be
        identical, body included.
        """
        real = make_org(slug="acme-motors")

        existing = client.get(url_for(real))
        invented = client.get("/api/v1/orgs/not-a-customer/provisioning/")

        assert existing.status_code == invented.status_code == 401
        assert existing.json()["code"] == invented.json()["code"]

    def test_a_stranger_cannot_tell_a_real_slug_from_a_made_up_one(self, client):
        """
        The same property one step along: signed in, but nothing to do with
        either organisation. Both must be 404 with the same body, or the
        slug still answers whether a given company uses the platform.
        """
        real = make_org(slug="acme-motors")
        stranger = User.objects.create_user(email="stranger@elsewhere.test", password="x")
        client.force_authenticate(user=stranger)

        existing = client.get(url_for(real))
        invented = client.get("/api/v1/orgs/not-a-customer/provisioning/")

        assert existing.status_code == invented.status_code == 404
        assert existing.json()["code"] == invented.json()["code"]

    def test_the_refusal_is_problem_json_like_every_other_error(self, client):
        """
        The middleware cannot use `config.exception_handler` -- Django calls
        middleware, not DRF, so nothing here is inside the try/except that
        handler lives in. It therefore builds the same body by hand, and this
        is what stops that drifting into a second error format the frontend
        would need a separate branch for.
        """
        user = User.objects.create_user(email="nobody@acme.test", password="x")
        client.force_authenticate(user=user)

        response = client.get("/api/v1/orgs/nope/provisioning/")
        body = response.json()

        assert response["Content-Type"] == "application/problem+json"
        assert set(body) >= {"type", "title", "status", "detail", "code", "trace_id"}
        assert body["status"] == 404
        assert body["code"] == "not_found"


class TestBinding:
    def test_a_member_gets_through_and_reads_the_provisioning_state(self, client):
        organization = make_org()
        client.force_authenticate(user=make_member(organization))

        response = client.get(url_for(organization))

        assert response.status_code == 200
        assert response.json() == {"is_ready": False}

    def test_it_reports_ready_once_the_organization_is_stamped(self, client):
        organization = make_org()
        client.force_authenticate(user=make_member(organization))
        Organization.objects.filter(pk=organization.pk).update(
            provisioned_at="2026-10-05T00:00:00Z"
        )

        response = client.get(url_for(organization))

        assert response.json() == {"is_ready": True}


class TestResetting:
    """
    The property that fails under load and never in development.
    """

    def test_the_tenant_binding_is_cleared_after_the_request(self, client):
        organization = make_org()
        client.force_authenticate(user=make_member(organization))

        assert current_tenant_db.get() is None
        client.get(url_for(organization))

        # If this leaked, the next request on this thread would read THIS
        # organisation's database whatever slug it asked for.
        assert current_tenant_db.get() is None

    def test_it_is_cleared_even_when_the_view_refuses(self, client):
        """
        The reset is in a `finally`, so it has to survive the endpoint raising.
        A refusal path that leaked context would be the worst version of this
        bug: it only happens when something already went wrong.
        """
        organization = make_org()
        outsider = User.objects.create_user(email="outsider@elsewhere.test", password="x")
        client.force_authenticate(user=outsider)

        response = client.get(url_for(organization))

        assert response.status_code == 404
        assert current_tenant_db.get() is None

    def test_allowed_units_is_cleared_too(self, client):
        organization = make_org()
        client.force_authenticate(user=make_member(organization))

        client.get(url_for(organization))

        assert allowed_units.get() is None

    def test_nothing_is_bound_for_a_request_outside_orgs(self, client):
        """
        `/me` is not org-scoped -- it is what tells the browser which slugs
        exist, so it cannot sit behind one. No tenant is bound for it, and the
        router then REFUSES any tenant model touched during that request rather
        than falling back to the control database. That is the fail-closed rule.
        """
        organization = make_org()
        client.force_authenticate(user=make_member(organization))

        response = client.get("/api/v1/me/")

        assert response.status_code == 200
        assert current_tenant_db.get() is None
