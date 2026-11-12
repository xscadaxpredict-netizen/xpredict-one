"""
`allowed_units` has three states, and "nobody decided" refuses.

Before this, the dealership scope had two: a set of dealerships, or None for
"every dealership". The middleware reset it to None per request, so None also
meant "nobody set it" -- and any code path that forgot to set it read every
dealership's records. A view not built on `TenantAPIView`, a Celery task, a
management command: each would have shown a dealer everybody's enquiries with
nothing in any log. Fail-open, the one thing the tenancy rules forbid.

Now the middleware resets it to `NOT_SET`, and `UnitScopedManager` raises on
that. The tests below pin each state, the reset, the escape hatches
(`unit_scope(None)` and `all_units`), and the two public sign-link endpoints
that were reading "every dealership" by accident and now say so on purpose.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import ClassVar

import pytest
from django.urls import include, path
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIClient

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationStatus,
)
from products.dms.sales.models import ConfirmedSite, Customer, Enquiry
from products.dms.site_services.models import ReportAttachment, ServiceReport
from shared.base_models import NOT_SET, UnitScopeMissingError, allowed_units, unit_scope

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
    pytest.mark.urls(__name__),
]

# What the probe saw inside its request, so a test can look after the fact.
seen_inside: list[object] = []


class ForgetfulDmsReader(OrgScopedAPIView):
    """
    A view reading dealership records WITHOUT `TenantAPIView` -- the mistake.

    Membership alone, so the membership and permission layers are not what
    stops it; only the dealership scope can.
    """

    required_permissions: ClassVar[list[str]] = []

    def get(self, request: Request, org_slug: str) -> Response:
        seen_inside.append(allowed_units.get())
        return Response({"count": Enquiry.objects.count()})


urlpatterns = [
    path("api/v1/orgs/<slug:org_slug>/forgetful/", ForgetfulDmsReader.as_view()),
    path(
        "api/v1/orgs/<str:org_slug>/dms/site-services/",
        include("products.dms.site_services.api.urls"),
    ),
]


@pytest.fixture(autouse=True)
def _clear_probe():
    seen_inside.clear()
    yield
    seen_inside.clear()


@pytest.fixture
def tenant_db():
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        yield
    finally:
        current_tenant_db.reset(token)


def make_org(slug="scope-motors") -> Organization:
    return Organization.objects.create(
        name=f"Org {slug}",
        slug=slug,
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=OrganizationStatus.ACTIVE,
    )


def make_member(organization) -> User:
    user = User.objects.create_user(email="member@scope.test", password="x")
    Membership.objects.create(
        user=user,
        organization=organization,
        role=MembershipRole.MEMBER,
        status=MembershipStatus.ACTIVE,
    )
    return user


def enquiry_at(unit_id: uuid.UUID) -> Enquiry:
    with unit_scope(None):
        return Enquiry.objects.create(unit_id=unit_id, customer_name="C", phone="1")


# ---------------------------------------------------------------------------
# The manager: three states.
# ---------------------------------------------------------------------------


class TestNobodyDecidedRefuses:
    def test_the_default_is_not_set(self):
        assert allowed_units.get() is NOT_SET

    def test_a_query_with_no_scope_raises(self, tenant_db):
        with pytest.raises(UnitScopeMissingError, match="Enquiry"):
            list(Enquiry.objects.all())

    def test_creating_through_objects_raises_too(self, tenant_db):
        """`.objects.create()` goes through the same manager."""
        with pytest.raises(UnitScopeMissingError):
            Enquiry.objects.create(unit_id=uuid.uuid4(), customer_name="C", phone="1")

    def test_all_units_is_unaffected(self, tenant_db):
        """The deliberate escape hatch reads every dealership, scope or not."""
        delhi, jaipur = uuid.uuid4(), uuid.uuid4()
        a, b = enquiry_at(delhi), enquiry_at(jaipur)

        ids = set(Enquiry.all_units.filter(pk__in=[a.pk, b.pk]).values_list("pk", flat=True))

        assert ids == {a.pk, b.pk}


class TestADecisionIsHonoured:
    def test_none_is_every_dealership(self, tenant_db):
        a, b = enquiry_at(uuid.uuid4()), enquiry_at(uuid.uuid4())

        with unit_scope(None):
            ids = set(Enquiry.objects.values_list("pk", flat=True))

        assert {a.pk, b.pk} <= ids

    def test_a_set_is_those_dealerships(self, tenant_db):
        delhi, jaipur = uuid.uuid4(), uuid.uuid4()
        a, b = enquiry_at(delhi), enquiry_at(jaipur)

        with unit_scope(frozenset({delhi})):
            ids = set(Enquiry.objects.values_list("pk", flat=True))

        assert a.pk in ids
        assert b.pk not in ids

    def test_an_empty_set_is_nothing(self, tenant_db):
        enquiry_at(uuid.uuid4())

        with unit_scope(frozenset()):
            assert Enquiry.objects.count() == 0


class TestUnitScopePutsItBack:
    def test_restored_on_the_way_out(self):
        with unit_scope(frozenset()):
            pass

        assert allowed_units.get() is NOT_SET

    def test_restored_when_the_code_inside_raises(self):
        with pytest.raises(ValueError), unit_scope(None):
            raise ValueError

        assert allowed_units.get() is NOT_SET

    def test_a_nested_scope_does_not_leak_outwards(self):
        delhi = frozenset({uuid.uuid4()})

        with unit_scope(delhi):
            with unit_scope(None):
                pass
            assert allowed_units.get() == delhi


# ---------------------------------------------------------------------------
# The middleware: a request starts at "nobody decided".
# ---------------------------------------------------------------------------


class TestARequestStartsUndecided:
    def test_a_view_that_forgets_is_a_500_not_every_dealership(self):
        """THE BUG THIS CLOSES. It answered 200 with every dealership's count."""
        organization = make_org()
        client = APIClient()
        client.force_authenticate(user=make_member(organization))

        response = client.get(f"/api/v1/orgs/{organization.slug}/forgetful/")

        assert seen_inside == [NOT_SET]
        assert response.status_code == 500

    def test_a_wider_value_left_on_the_thread_is_not_inherited(self):
        """A previous request's None must not become this request's answer."""
        organization = make_org()
        client = APIClient()
        client.force_authenticate(user=make_member(organization))

        with unit_scope(None):
            response = client.get(f"/api/v1/orgs/{organization.slug}/forgetful/")
            assert allowed_units.get() is None

        assert seen_inside == [NOT_SET]
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# The public sign links: nobody signed in, so they say what they mean.
# ---------------------------------------------------------------------------


def report_at(unit_id: uuid.UUID) -> ServiceReport:
    with unit_scope(None):
        enquiry = Enquiry.objects.create(unit_id=unit_id, customer_name="C", phone="1")
        customer = Customer.objects.create(unit_id=unit_id, name="Customer")
        site = ConfirmedSite.objects.create(unit_id=unit_id, enquiry=enquiry, customer=customer)
        report = ServiceReport.objects.create(
            unit_id=unit_id,
            site=site,
            service_date=date(2026, 11, 12),
            service_person_name="Tech",
        )
        ReportAttachment.objects.create(
            unit_id=unit_id, service_report=report, file="reports/attachments/a.pdf"
        )
    return report


class TestThePublicSignLink:
    def url(self, organization, report, suffix=""):
        return (
            f"/api/v1/orgs/{organization.slug}/dms/site-services/"
            f"public/report/{report.sign_link_token}/{suffix}"
        )

    def test_the_link_opens_the_report_with_its_attachments(self, tenant_db):
        organization = make_org()
        report = report_at(uuid.uuid4())

        response = APIClient().get(self.url(organization, report))

        assert response.status_code == 200
        assert response.json()["id"] == str(report.pk)
        assert len(response.json()["attachments"]) == 1

    def test_the_link_can_be_signed(self, tenant_db, settings, tmp_path):
        settings.MEDIA_ROOT = tmp_path  # the signature is a real file
        organization = make_org()
        report = report_at(uuid.uuid4())
        # A 1x1 PNG.
        png = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA"
            "DUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        )

        response = APIClient().post(
            self.url(organization, report, "sign/"),
            {"signature": png, "client_name": "Customer"},
            format="json",
        )

        assert response.status_code == 200
        with unit_scope(None):
            assert ServiceReport.objects.get(pk=report.pk).client_name == "Customer"
