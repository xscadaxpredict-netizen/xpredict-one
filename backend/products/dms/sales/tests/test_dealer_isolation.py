from __future__ import annotations

import uuid
import pytest
from django.db import connection
from rest_framework import status
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from config.routers import current_tenant_db
from core.accounts.models import User
from core.organizations.models import (
    BusinessUnit,
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationStatus,
)
from core.billing.models import AppSubscription, SubscriptionStatus
from core.permissions.models import AppAccess, AppCode, Role
from products.dms.sales.models import Customer, Enquiry, EnquiryStatus
from products.dms.sales import selectors
from shared.base_models import allowed_units

pytestmark = pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])


def create_test_org(slug="test-dealers-org") -> Organization:
    org = Organization.objects.create(
        name="Test Dealers Org",
        slug=slug,
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=OrganizationStatus.ACTIVE,
    )
    AppSubscription.objects.create(
        organization=org,
        app=AppCode.DMS,
        status=SubscriptionStatus.ACTIVE,
    )
    return org


def create_dealer_user(org, unit, email, role_code="dms.sales_representative"):
    user = User.objects.create_user(email=email, password="password123")
    membership = Membership.objects.create(
        user=user,
        organization=org,
        unit=unit,
        role=MembershipRole.MEMBER,
        status=MembershipStatus.ACTIVE,
    )
    role = Role.objects.get(app=AppCode.DMS, code=role_code)
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=role,
    )
    return user, membership


class TestDealerAndColleagueIsolation:
    def test_enquiry_selectors_dealer_scoping(self):
        """allowed_units filters enquiries by dealership."""
        dealer_a = uuid.uuid4()
        dealer_b = uuid.uuid4()
        user_a1 = uuid.uuid4()
        user_b1 = uuid.uuid4()

        # Switch context to tenant db
        token_db = current_tenant_db.set(TEST_TENANT_ALIAS)
        try:
            # Create enquiry for Dealer A
            enq_a = Enquiry.objects.create(
                unit_id=dealer_a,
                customer_name="Customer A",
                phone="1234567890",
                created_by_user_id=user_a1,
            )
            # Create enquiry for Dealer B
            enq_b = Enquiry.objects.create(
                unit_id=dealer_b,
                customer_name="Customer B",
                phone="9876543210",
                created_by_user_id=user_b1,
            )

            # 1. When allowed_units is scoped to Dealer A
            token_units = allowed_units.set(frozenset({dealer_a}))
            try:
                enquiries_a = list(selectors.list_enquiries(is_manager_or_admin=True))
                enquiry_ids_a = [e.id for e in enquiries_a]
                assert enq_a.id in enquiry_ids_a
                assert enq_b.id not in enquiry_ids_a
            finally:
                allowed_units.reset(token_units)

            # 2. When allowed_units is scoped to Dealer B
            token_units_b = allowed_units.set(frozenset({dealer_b}))
            try:
                enquiries_b = list(selectors.list_enquiries(is_manager_or_admin=True))
                enquiry_ids_b = [e.id for e in enquiries_b]
                assert enq_b.id in enquiry_ids_b
                assert enq_a.id not in enquiry_ids_b
            finally:
                allowed_units.reset(token_units_b)

        finally:
            current_tenant_db.reset(token_db)

    def test_colleague_privacy_within_same_dealer(self):
        """Colleagues in the same dealership only see their own enquiries; managers see all."""
        dealer_a = uuid.uuid4()
        user_rep1 = uuid.uuid4()
        user_rep2 = uuid.uuid4()

        token_db = current_tenant_db.set(TEST_TENANT_ALIAS)
        token_units = allowed_units.set(frozenset({dealer_a}))
        try:
            enq1 = Enquiry.objects.create(
                unit_id=dealer_a,
                customer_name="Rep 1 Lead",
                phone="1111111111",
                created_by_user_id=user_rep1,
            )
            enq2 = Enquiry.objects.create(
                unit_id=dealer_a,
                customer_name="Rep 2 Lead",
                phone="2222222222",
                created_by_user_id=user_rep2,
            )

            # Rep 1 only sees their own enquiry
            rep1_enquiries = list(selectors.list_enquiries(actor_user_id=user_rep1, is_manager_or_admin=False))
            rep1_ids = [e.id for e in rep1_enquiries]
            assert enq1.id in rep1_ids
            assert enq2.id not in rep1_ids

            # Rep 2 only sees their own enquiry
            rep2_enquiries = list(selectors.list_enquiries(actor_user_id=user_rep2, is_manager_or_admin=False))
            rep2_ids = [e.id for e in rep2_enquiries]
            assert enq2.id in rep2_ids
            assert enq1.id not in rep2_ids

            # get_enquiry for Rep 1 on Rep 2's lead returns None (404)
            assert selectors.get_enquiry(enquiry_id=enq2.id, actor_user_id=user_rep1, is_manager_or_admin=False) is None
            assert selectors.get_enquiry(enquiry_id=enq1.id, actor_user_id=user_rep1, is_manager_or_admin=False) is not None

            # Manager sees both
            mgr_enquiries = list(selectors.list_enquiries(is_manager_or_admin=True))
            mgr_ids = [e.id for e in mgr_enquiries]
            assert enq1.id in mgr_ids
            assert enq2.id in mgr_ids

        finally:
            allowed_units.reset(token_units)
            current_tenant_db.reset(token_db)

    def test_api_dealer_and_colleague_isolation(self):
        """API endpoints enforce dealer isolation, colleague privacy, and permissions."""
        client = APIClient()
        org = create_test_org("dms-isolation-org")
        unit_a = BusinessUnit.objects.create(organization=org, name="Unit A")
        unit_b = BusinessUnit.objects.create(organization=org, name="Unit B")

        user_rep1, _ = create_dealer_user(org, unit_a, "rep1@unit-a.test", "dms.sales_representative")
        user_rep2, _ = create_dealer_user(org, unit_a, "rep2@unit-a.test", "dms.sales_representative")
        user_mgr, _ = create_dealer_user(org, unit_a, "mgr@unit-a.test", "dms.manager")
        user_rep_b, _ = create_dealer_user(org, unit_b, "rep@unit-b.test", "dms.sales_representative")
        user_tech, _ = create_dealer_user(org, unit_a, "tech@unit-a.test", "dms.technician")

        url = f"/api/v1/orgs/{org.slug}/dms/sales/enquiries/"

        # 1. Rep 1 creates an enquiry at Unit A
        client.force_authenticate(user=user_rep1)
        resp1 = client.post(
            url,
            {
                "customer_name": "Customer One",
                "phone": "9999999991",
                "priority": "HIGH",
            },
            format="json",
        )
        assert resp1.status_code == status.HTTP_201_CREATED, resp1.data
        enq1_id = resp1.data["id"]

        # 2. Rep 2 creates an enquiry at Unit A
        client.force_authenticate(user=user_rep2)
        resp2 = client.post(
            url,
            {
                "customer_name": "Customer Two",
                "phone": "9999999992",
                "priority": "LOW",
            },
            format="json",
        )
        assert resp2.status_code == status.HTTP_201_CREATED, resp2.data
        enq2_id = resp2.data["id"]

        # 3. DEALER ISOLATION: Rep B (Unit B) lists enquiries -> sees NOTHING
        client.force_authenticate(user=user_rep_b)
        resp_b = client.get(url)
        assert resp_b.status_code == status.HTTP_200_OK
        ids_b = [e["id"] for e in resp_b.data]
        assert enq1_id not in ids_b
        assert enq2_id not in ids_b

        # Rep B tries to fetch Rep A's enquiry by ID -> 404
        resp_b_detail = client.get(f"{url}{enq1_id}/")
        assert resp_b_detail.status_code == status.HTTP_404_NOT_FOUND

        # 4. COLLEAGUE PRIVACY: Rep 1 lists enquiries -> sees ONLY their own enquiry
        client.force_authenticate(user=user_rep1)
        resp_rep1_list = client.get(url)
        assert resp_rep1_list.status_code == status.HTTP_200_OK
        ids_rep1 = [e["id"] for e in resp_rep1_list.data]
        assert enq1_id in ids_rep1
        assert enq2_id not in ids_rep1

        # Rep 1 tries to GET Rep 2's enquiry -> 404
        resp_rep1_get_other = client.get(f"{url}{enq2_id}/")
        assert resp_rep1_get_other.status_code == status.HTTP_404_NOT_FOUND

        # Rep 1 tries to PATCH Rep 2's enquiry -> 404
        resp_rep1_patch_other = client.patch(f"{url}{enq2_id}/", {"priority": "URGENT"}, format="json")
        assert resp_rep1_patch_other.status_code == status.HTTP_404_NOT_FOUND

        # 5. MANAGER VISIBILITY: Manager at Unit A sees BOTH enquiries
        client.force_authenticate(user=user_mgr)
        resp_mgr_list = client.get(url)
        assert resp_mgr_list.status_code == status.HTTP_200_OK
        ids_mgr = [e["id"] for e in resp_mgr_list.data]
        assert enq1_id in ids_mgr
        assert enq2_id in ids_mgr

        # 6. PERMISSION ENFORCEMENT: Technician has no dms.enquiry.create -> 403 Forbidden
        client.force_authenticate(user=user_tech)
        resp_tech_post = client.post(
            url,
            {
                "customer_name": "Intruder Enquiry",
                "phone": "0000000000",
            },
            format="json",
        )
        assert resp_tech_post.status_code == status.HTTP_403_FORBIDDEN

