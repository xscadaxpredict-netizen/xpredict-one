"""
C72 piece 3, step 3a: each record type says where it may live, and a child
lives wherever its parent lives.

The tree is `test_subtrees.py`'s:

    Apex Motors (root)
    ├── North (region)
    │   ├── Delhi Motors (dealer)          <- the first dealership created
    │   │   └── Delhi East (branch)
    │   └── Jaipur Auto (dealer)
    └── South (region)
        └── Chennai Cars (dealer)

THE BUG THIS STEP FIXES, and what every "child" test below re-enacts: a
regional manager at North opens an enquiry filed at Delhi East and adds a
follow-up. The view used to pass the MANAGER's working place --
`request.unit_id`, then `request.territory_id` -- which for somebody above
several places is the first dealership in their region, Delhi. So the
follow-up was filed at Delhi, where Delhi East's own people could not see it,
on their own customer. Now nothing passes a place for a child: its `save()`
copies the parent's home.

Three parts:

- DECLARATIONS: every dealership-scoped model declares exactly one of
  `home_kinds` (a person files it) or `home_follows` (it hangs off a parent).
  A model that declares neither fails here, not in production (C66's lesson:
  a default nobody chose is indistinguishable from one somebody did).
- FILING: `home_for()` offers only the record type's own kinds.
- CHILDREN: through the real endpoints, every child lands at its parent's home.
"""

from __future__ import annotations

from datetime import date

import pytest
from django.apps import apps
from django.db import models
from rest_framework.test import APIClient

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.api import home_for
from core.organizations.models import TerritoryKind
from core.organizations.services import add_territory
from core.permissions.models import AppCode
from products.dms.ecommerce.models import EcommerceOrder, EcommerceOrderItem
from products.dms.homes import DEALERSHIP_RECORD
from products.dms.sales.models import (
    BankAccount,
    ConfirmedSite,
    Customer,
    Enquiry,
    Followup,
    ProductCatalog,
    ProductSpec,
    Quotation,
    QuotationItem,
)
from products.dms.site_services.models import (
    Complaint,
    ReportAttachment,
    ServiceReport,
    ServiceSchedule,
    SiteServiceProfile,
    WaterReport,
)
from shared.base_models import HomeMissingError, TerritoryScopedModel, territory_scope
from shared.exceptions import ConflictError
from tests.test_subtrees import build_tree, found, person

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


@pytest.fixture
def tenant_db():
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        yield
    finally:
        current_tenant_db.reset(token)


def scoped_models() -> list[type[TerritoryScopedModel]]:
    return [
        model
        for model in apps.get_models()
        if issubclass(model, TerritoryScopedModel) and not model._meta.abstract
    ]


# ---------------------------------------------------------------------------
# Every record type says where it lives.
# ---------------------------------------------------------------------------


class TestEveryRecordTypeDeclaresItsHome:
    def test_there_are_records_to_check(self):
        """Guards the guards: an empty list would pass every test below."""
        assert len(scoped_models()) >= 19

    @pytest.mark.parametrize("model", scoped_models(), ids=lambda m: m.__name__)
    def test_exactly_one_of_home_kinds_or_home_follows(self, model):
        declared = [name for name in ("home_kinds", "home_follows") if getattr(model, name)]

        assert len(declared) == 1, (
            f"{model.__name__} must declare `home_kinds` (a person files it) or "
            f"`home_follows` (it lives with its parent) -- it declares {declared or 'neither'}."
        )

    @pytest.mark.parametrize(
        "model", [m for m in scoped_models() if m.home_kinds], ids=lambda m: m.__name__
    )
    def test_home_kinds_are_real_kinds_and_never_a_warehouse(self, model):
        """A warehouse is for stock; no DMS record type today lives at one."""
        assert set(model.home_kinds) <= set(TerritoryKind.values)
        assert TerritoryKind.WAREHOUSE not in model.home_kinds

    @pytest.mark.parametrize(
        "model", [m for m in scoped_models() if m.home_follows], ids=lambda m: m.__name__
    )
    def test_home_follows_names_a_parent_that_has_a_home(self, model):
        for name in model.home_follows:
            field = model._meta.get_field(name)
            assert isinstance(field, models.ForeignKey), f"{model.__name__}.{name}"
            assert issubclass(field.related_model, TerritoryScopedModel), (
                f"{model.__name__}.{name} points at {field.related_model.__name__}, "
                "which has no home to follow"
            )

    def test_the_records_a_person_files(self):
        """Pinned, so adding one is a decision rather than a default."""
        filed = {m.__name__ for m in scoped_models() if m.home_kinds}

        # Bank accounts and products are GLOBAL-OR-LOCAL now (`main`, Nishanth):
        # not territory-scoped. `main`'s three new filed record types join.
        assert filed == {
            "Enquiry",
            "Customer",
            "CallRequest",
            "TechnoCommercialDocument",
            "AgentPayout",
            "ECDosingCalculation",
        }


# ---------------------------------------------------------------------------
# Filing a record a person creates.
# ---------------------------------------------------------------------------


class DealerOnly:
    """A record type that may live only at a dealership -- not in DMS today."""

    home_kinds = (TerritoryKind.DEALER,)
    home_follows = None


class TestFilingUsesTheRecordTypesOwnKinds:
    def test_a_place_the_record_type_cannot_live_at_is_ignored(self):
        """
        North is inside the regional manager's subtree, and an enquiry may
        live there (the regional pool) -- but this record type may not, so
        naming North is ignored and the record goes where it would have gone
        without a choice: nowhere, since the person's own place is a region
        (the merge of `main`, 2026-11-23, removed the guess that picked the
        first dealership) -- a 409 asking them to choose.
        """
        result = found()
        t = build_tree(result.organization)
        at_north = person(result.organization, "n@apex.test", [t.north])

        def filed(model):
            return home_for(
                model,
                membership=at_north,
                organization=result.organization,
                requested=str(t.north.pk),
                app=AppCode.DMS,
            )

        assert filed(Enquiry) == t.north.pk
        with pytest.raises(ConflictError):
            filed(DealerOnly)

    def test_their_own_branch_is_not_used_if_the_record_type_cannot_live_there(self):
        """
        Placed at one branch, a person files there -- unless the record type
        may not live at a branch. With no dealership below Delhi East to fall
        back on, there is nowhere: a 409.
        """
        result = found()
        t = build_tree(result.organization)
        at_branch = person(result.organization, "e@apex.test", [t.delhi_east])

        with pytest.raises(ConflictError):
            home_for(
                DealerOnly,
                membership=at_branch,
                organization=result.organization,
                requested=None,
                app=AppCode.DMS,
            )

    def test_a_child_is_never_filed_by_a_person(self):
        result = found()

        with pytest.raises(TypeError, match="takes its parent's home"):
            home_for(
                Followup,
                membership=result.membership,
                organization=result.organization,
                requested=None,
                app=AppCode.DMS,
            )

    def test_a_header_that_is_not_an_id_is_ignored_not_a_500(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)
        at_delhi = person(result.organization, "d@apex.test", [t.delhi])
        client = APIClient()
        client.force_authenticate(user=at_delhi.user)

        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/dms/sales/enquiries/",
            {"customer_name": "New", "phone": "9"},
            format="json",
            HTTP_X_UNIT_ID="not-a-uuid",
        )

        assert response.status_code == 201, response.content

    def test_nowhere_to_file_is_a_409_not_a_500(self, tenant_db):
        """
        Somebody whose only place is a WAREHOUSE (for stock: no DMS record
        lives there), and no choice made: nowhere fits. This used to reach the
        database with no home and come back as a 500. (A region with no
        dealership was the case before the merge of `main`, 2026-11-23; a
        regional person now files at their region, the regional pool.)
        """
        result = found(tenant=True)
        t = build_tree(result.organization)
        store = add_territory(
            organization=result.organization,
            kind=TerritoryKind.WAREHOUSE,
            name="South store",
            parent_id=t.south.pk,
        )
        at_store_only = person(result.organization, "s@apex.test", [store])
        client = APIClient()
        client.force_authenticate(user=at_store_only.user)

        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/dms/sales/enquiries/",
            {"customer_name": "New", "phone": "9"},
            format="json",
        )

        assert response.status_code == 409, response.content
        assert response.json()["code"] == "no_home"


# ---------------------------------------------------------------------------
# A child lives wherever its parent lives.
# ---------------------------------------------------------------------------


class TestAChildTakesItsParentsHome:
    """At the model, where the rule lives -- whatever a caller passes."""

    def test_a_follow_up_is_filed_with_its_enquiry(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)
        with territory_scope(None):
            enquiry = Enquiry.objects.create(
                territory_id=t.delhi_east.pk, customer_name="C", phone="1"
            )
            followup = Followup.objects.create(enquiry=enquiry)

        assert followup.territory_id == t.delhi_east.pk

    def test_a_place_passed_for_a_child_is_overruled(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)
        with territory_scope(None):
            enquiry = Enquiry.objects.create(
                territory_id=t.delhi_east.pk, customer_name="C", phone="1"
            )
            followup = Followup.objects.create(enquiry=enquiry, territory_id=t.delhi.pk)

        assert followup.territory_id == t.delhi_east.pk

    def test_an_attachment_follows_whichever_parent_it_has(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)
        with territory_scope(None):
            site = make_site(t.jaipur.pk)
            water = WaterReport.objects.create(site=site, date_tested=date(2026, 11, 16))
            attachment = ReportAttachment.objects.create(
                water_report=water, file="reports/attachments/a.pdf"
            )

        assert attachment.territory_id == t.jaipur.pk

    def test_a_child_with_no_parent_refuses_to_save(self, tenant_db):
        found(tenant=True)
        with territory_scope(None), pytest.raises(HomeMissingError):
            ReportAttachment.objects.create(file="reports/attachments/a.pdf")


def make_site(territory_id) -> ConfirmedSite:
    """
    A real site, as `main`'s site lifecycle counts one (merge, 2026-11-23): its
    enquiry CONFIRMED, and a confirmed AMC -- no AMC, no visit.
    """
    enquiry = Enquiry.objects.create(
        territory_id=territory_id, customer_name="C", phone="1", status="CONFIRMED"
    )
    customer = Customer.objects.create(territory_id=territory_id, name="Customer")
    site = ConfirmedSite.objects.create(enquiry=enquiry, customer=customer)
    Quotation.objects.create(
        enquiry=enquiry,
        site=site,
        title="AMC",
        quote_no=f"AMC-{site.pk.hex[:8]}",
        quote_type="AMC",
        status="CONFIRMED",
    )
    return site


class TestThroughTheApi:
    """
    A regional manager at North -- whose old "working place" was Delhi, the
    first dealership in the region -- works on Delhi East's enquiry and
    Delhi East's site. Every row they create must land at Delhi East.
    """

    def setup(self):
        result = found(tenant=True)
        t = build_tree(result.organization)
        self.organization = result.organization
        client = self.client_for(person(result.organization, "n@apex.test", [t.north]))
        base = f"/api/v1/orgs/{result.organization.slug}/dms"
        return t, client, base

    def client_for(self, membership):
        client = APIClient()
        client.force_authenticate(user=membership.user)
        return client

    def homes(self, model, **filters) -> set:
        with territory_scope(None):
            return set(model.objects.filter(**filters).values_list("territory_id", flat=True))

    def test_follow_up_quotation_and_confirmation(self, tenant_db):
        t, client, base = self.setup()
        with territory_scope(None):
            enquiry = Enquiry.objects.create(
                territory_id=t.delhi_east.pk, customer_name="C", phone="1"
            )
            bank = BankAccount.objects.create(
                territory_id=t.delhi_east.pk, bank_name="B", account_no="1", ifsc_code="I"
            )
        url = f"{base}/sales/enquiries/{enquiry.pk}"

        followup = client.post(f"{url}/followups/", {"remarks": "Call back"}, format="json")
        quote = client.post(
            f"{url}/quotations/",
            {
                "title": "RO plant",
                "quote_no": "Q-1",
                "type": "NORMAL",
                "status": "DRAFT",
                "from_details": {},
                "to_details": {},
                "selected_bank_id": str(bank.pk),
                "items": [
                    {
                        "description": "Plant",
                        "base_price": "100.00",
                        "margin": "10.00",
                        "gst_rate": "18.00",
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        assert (followup.status_code, quote.status_code) == (201, 201), (
            followup.content,
            quote.content,
        )
        with territory_scope(None):
            quotation = Quotation.objects.get(enquiry=enquiry)
        confirmed = client.post(f"{url}/confirm/", {"quote_id": str(quotation.pk)}, format="json")
        assert confirmed.status_code == 200, confirmed.content

        assert self.homes(Followup, enquiry=enquiry) == {t.delhi_east.pk}
        assert self.homes(Quotation, enquiry=enquiry) == {t.delhi_east.pk}
        assert self.homes(QuotationItem, quotation__enquiry=enquiry) == {t.delhi_east.pk}
        assert self.homes(ConfirmedSite, enquiry=enquiry) == {t.delhi_east.pk}
        assert self.homes(Customer, enquiries=enquiry) == {t.delhi_east.pk}

    def test_everything_hanging_off_a_site(self, tenant_db):
        t, client, base = self.setup()
        with territory_scope(None):
            site = make_site(t.delhi_east.pk)
            product = ProductCatalog.objects.create(
                territory_id=t.delhi_east.pk, product_type="SPARES", base_price=10
            )
        site_id = str(site.pk)

        made = {
            "profile": client.patch(
                f"{base}/site-services/sites/{site_id}/profile/", {"notes": "n"}, format="json"
            ),
            "schedule": client.post(
                f"{base}/site-services/schedules/",
                {"site_id": site_id, "scheduled_date": "2026-11-20"},
                format="json",
            ),
            "service report": client.post(
                f"{base}/site-services/service-reports/",
                {"site_id": site_id, "service_date": "2026-11-16", "service_person_name": "T"},
                format="json",
            ),
            "water report": client.post(
                f"{base}/site-services/water-reports/",
                {"site_id": site_id, "date_tested": "2026-11-16"},
                format="json",
            ),
            # A complaint is a ticket, which a Manager does not raise: a
            # regional Tech support person does.
            "complaint": self.client_for(
                person(self.organization, "ts@apex.test", [t.north], role="dms.tech_support")
            ).post(
                f"{base}/site-services/complaints/",
                {"site_id": site_id, "description": "Leak"},
                format="json",
            ),
            "store order": client.post(
                f"{base}/ecommerce/orders/",
                {"site_id": site_id, "items": [{"product_id": str(product.pk), "quantity": 2}]},
                format="json",
            ),
            # ("timer calculation" went with Timer Calculation: `main`, merged 2026-11-26.)
        }
        failed = {name: r.status_code for name, r in made.items() if r.status_code >= 300}
        assert not failed, failed

        for model in (
            SiteServiceProfile,
            ServiceSchedule,
            ServiceReport,
            WaterReport,
            Complaint,
            EcommerceOrder,
        ):
            assert self.homes(model, site=site) == {t.delhi_east.pk}, model.__name__
        assert self.homes(EcommerceOrderItem, order__site=site) == {t.delhi_east.pk}

    def test_a_products_specs_live_with_the_product(self, tenant_db):
        t, client, base = self.setup()

        response = client.post(
            f"{base}/sales/products/",
            {
                "type": "SPARES",
                "base_price": "10.00",
                "margin": "0",
                "description": "Filter",
                "specs": "5 micron, 10 inch",
            },
            format="json",
            HTTP_X_UNIT_ID=str(t.delhi_east.pk),
        )
        assert response.status_code == 201, response.content

        with territory_scope(None):
            product = ProductCatalog.objects.get(pk=response.json()["id"])
        assert product.territory_id == t.delhi_east.pk
        assert self.homes(ProductSpec, product=product) == {t.delhi_east.pk}


def test_dms_records_are_filed_at_the_dealership_record_kinds():
    """`DEALERSHIP_RECORD` is the one list; C76's amendment names its four."""
    assert set(DEALERSHIP_RECORD) == {
        TerritoryKind.ORGANISATION,
        TerritoryKind.REGION,
        TerritoryKind.DEALER,
        TerritoryKind.BRANCH,
    }
