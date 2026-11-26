"""
NUMBERS CARRY THE TERRITORY'S CODE (the owner, 2026-11-26):
`<PREFIX>/<code>/<FY>/<NNNN>` -- ENQ/DLM/26-27/0001, QT/..., AMC/..., SPR/...,
OC/... Each territory counts its own 1, 2, 3; the code makes every number
unique in the organisation, which is what lets Delete territory move records.
"""

from __future__ import annotations

import pytest
from django.utils import timezone

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.organizations.models import Organization, OrganizationStatus, Territory
from core.permissions.models import AppCode
from products.dms.sales import services
from products.dms.sales.exceptions import TerritoryNeedsACodeError
from products.dms.sales.models import Enquiry, Quotation
from shared.base_models import territory_scope

pytestmark = pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])

FY = services._financial_year_label(timezone.now().astimezone(services._FY_ZONE).date())


@pytest.fixture
def tenant():
    org = Organization.objects.create(
        name="Numbers Co",
        slug="numbers-co",
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=OrganizationStatus.ACTIVE,
    )
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        with territory_scope(None):
            yield org
    finally:
        current_tenant_db.reset(token)


def place(org, name, code):
    return Territory.objects.create(organization=org, name=name, code=code)


def enquiry_at(territory, number=None):
    return Enquiry.objects.create(
        territory_id=territory.pk,
        enquiry_no=number or services._generate_enquiry_number(territory.pk),
        customer_name="C",
        phone="1",
    )


class TestTheFormat:
    def test_enquiries_are_prefix_code_year_count(self, tenant):
        delhi = place(tenant, "Delhi Motors", "DLM")

        first, second = enquiry_at(delhi), enquiry_at(delhi)

        assert first.enquiry_no == f"ENQ/DLM/{FY}/0001"
        assert second.enquiry_no == f"ENQ/DLM/{FY}/0002"

    def test_each_territory_counts_its_own(self, tenant):
        delhi, jaipur = place(tenant, "Delhi Motors", "DLM"), place(tenant, "Jaipur Auto", "JPR")
        enquiry_at(delhi)
        enquiry_at(delhi)

        assert enquiry_at(jaipur).enquiry_no == f"ENQ/JPR/{FY}/0001"

    def test_quotes_keep_a_prefix_and_a_count_per_type(self, tenant):
        delhi = place(tenant, "Delhi Motors", "DLM")

        assert services._generate_quote_number(delhi.pk, "NORMAL") == f"QT/DLM/{FY}/0001"
        assert services._generate_quote_number(delhi.pk, "AMC") == f"AMC/DLM/{FY}/0001"
        assert services._generate_quote_number(delhi.pk, "SPARES") == f"SPR/DLM/{FY}/0001"

    def test_quotes_count_up_within_their_type(self, tenant):
        delhi = place(tenant, "Delhi Motors", "DLM")
        enquiry = enquiry_at(delhi)
        Quotation.objects.create(
            territory_id=delhi.pk,
            enquiry=enquiry,
            quote_no=services._generate_quote_number(delhi.pk, "NORMAL"),
            title="T",
        )

        assert services._generate_quote_number(delhi.pk, "NORMAL") == f"QT/DLM/{FY}/0002"
        assert services._generate_quote_number(delhi.pk, "AMC") == f"AMC/DLM/{FY}/0001"

    def test_confirmed_orders_are_oc_without_stp(self, tenant):
        delhi = place(tenant, "Delhi Motors", "DLM")

        assert services._generate_sequential_oc_number(delhi.pk) == f"OC/DLM/{FY}/0001"


class TestUniqueAcrossTheOrganisation:
    def test_a_moved_record_keeps_its_number_and_the_next_does_not_take_it(self, tenant):
        """
        Delete territory moves Delhi's records to Jaipur. They keep DLM numbers,
        Jaipur's own count goes on in JPR -- no clash, which per-dealer numbers
        (`main`'s ENQ/26-27/0001 at both) could not promise.
        """
        delhi, jaipur = place(tenant, "Delhi Motors", "DLM"), place(tenant, "Jaipur Auto", "JPR")
        moved = enquiry_at(delhi)
        enquiry_at(jaipur)

        Enquiry.all_territories.filter(pk=moved.pk).update(territory_id=jaipur.pk)

        assert Enquiry.all_territories.get(pk=moved.pk).enquiry_no == f"ENQ/DLM/{FY}/0001"
        assert enquiry_at(jaipur).enquiry_no == f"ENQ/JPR/{FY}/0002"

    def test_a_code_once_used_elsewhere_is_never_handed_out_twice(self, tenant):
        """
        Counted by the number's own prefix across the organisation, not by the
        territory's rows: a new territory given an old code continues its count.
        """
        old = place(tenant, "Old Delhi", "DLM")
        enquiry_at(old)
        old.code = "OLD"
        old.save()
        new = place(tenant, "New Delhi", "DLM")

        assert enquiry_at(new).enquiry_no == f"ENQ/DLM/{FY}/0002"

    def test_the_database_refuses_a_number_twice(self, tenant):
        from django.db import IntegrityError, transaction

        delhi = place(tenant, "Delhi Motors", "DLM")
        enquiry_at(delhi, number="ENQ/DLM/26-27/0001")

        with pytest.raises(IntegrityError) as caught, transaction.atomic(using=TEST_TENANT_ALIAS):
            enquiry_at(place(tenant, "Jaipur Auto", "JPR"), number="ENQ/DLM/26-27/0001")
        assert "uq_enquiry_no" in str(caught.value)


class TestATerritoryWithoutACode:
    def test_numbering_there_is_refused_naming_it(self, tenant):
        nameless = place(tenant, "Pune Branch", None)

        with pytest.raises(TerritoryNeedsACodeError) as caught:
            services._generate_enquiry_number(nameless.pk)

        assert caught.value.code == "territory_code_missing"
        assert "Pune Branch" in caught.value.message

    def test_the_organisation_starts_with_ho(self, tenant):
        top = Territory.objects.root_for(tenant, AppCode.DMS)

        assert top.code == "HO"
        assert services._generate_enquiry_number(top.pk) == f"ENQ/HO/{FY}/0001"

