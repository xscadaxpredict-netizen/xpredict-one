"""
A CLOSED TERRITORY'S RECORDS ARE READ-ONLY (C63, built 2026-11-25 at the
owner's word): "the records stay, and stay visible ... what stops is writing".

Closing already shuts out the people placed only there. This is everybody
else who can still see its records -- a regional manager, the owner: they read
them as before, and every change is refused (409 `territory_closed`) until the
territory is reopened. Only the closed box itself: a territory under it stays
open (closing does not cascade).
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager

import pytest
from django.db import transaction
from rest_framework.test import APIClient

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import ActivationCode, Membership, TerritoryKind
from core.organizations.services import (
    add_territory,
    close_territory,
    grant_app_access,
    reopen_territory,
    sign_up,
)
from core.permissions.models import AppCode, Role
from products.dms.sales.models import Enquiry
from shared.base_models import TerritoryClosedError, closed_territories, territory_scope

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found():
    ActivationCode.objects.create(code="CODE-ACME")
    result = sign_up(
        activation_code="CODE-ACME",
        organization_name="Acme Water",
        email="owner@acme.test",
        password="correct horse battery staple",
    )
    result.organization.db_name = TEST_TENANT_ALIAS
    result.organization.save(update_fields=["db_name"])
    return result


@contextmanager
def tenant():
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        with territory_scope(None):
            yield
    finally:
        current_tenant_db.reset(token)


def enquiry_at(territory, name="Sharma Farms"):
    with tenant():
        return Enquiry.objects.create(
            territory_id=territory.pk,
            customer_name=name,
            phone="1234567890",
            created_by_user_id=uuid.uuid4(),
        )


def name_of(enquiry):
    with tenant():
        return Enquiry.all_territories.get(pk=enquiry.pk).customer_name


def enquiry_url(result, enquiry):
    return f"/api/v1/orgs/{result.organization.slug}/dms/sales/enquiries/{enquiry.pk}/"


def setting():
    """North -> Delhi Motors, and Priya, a Manager placed at North (she sees Delhi's records)."""
    result = found()
    north = add_territory(organization=result.organization, kind="region", name="North")
    delhi = add_territory(
        organization=result.organization,
        kind=TerritoryKind.DEALER,
        name="Delhi Motors",
        parent_id=north.pk,
        gstin="27AAPFU0939F1ZV",
    )
    priya = Membership.objects.create(
        user=User.objects.create_user(email="priya@acme.test", password="x"),
        organization=result.organization,
    )
    grant_app_access(
        membership=priya,
        app=AppCode.DMS,
        role=Role.objects.get(code="dms.manager"),
        territories=[north],
    )
    return result, north, delhi, priya


class TestThroughTheDmsEndpoints:
    def test_a_regional_manager_reads_a_closed_dealer_s_record_but_cannot_change_it(self, client):
        result, _north, delhi, priya = setting()
        enquiry = enquiry_at(delhi)
        close_territory(territory=delhi)
        client.force_authenticate(user=priya.user)

        read = client.get(enquiry_url(result, enquiry))
        changed = client.patch(
            enquiry_url(result, enquiry), {"customer_name": "Changed"}, format="json"
        )
        deleted = client.delete(enquiry_url(result, enquiry))

        assert read.status_code == 200, read.content
        assert changed.status_code == 409
        assert changed.json()["code"] == "territory_closed"
        assert deleted.status_code == 409
        assert name_of(enquiry) == "Sharma Farms"

    def test_the_owner_too_until_it_is_reopened(self, client):
        result, _north, delhi, _priya = setting()
        enquiry = enquiry_at(delhi)
        close_territory(territory=delhi)
        client.force_authenticate(user=result.user)

        refused = client.patch(
            enquiry_url(result, enquiry), {"customer_name": "Changed"}, format="json"
        )
        reopen_territory(territory=delhi)
        allowed = client.patch(
            enquiry_url(result, enquiry), {"customer_name": "Changed"}, format="json"
        )

        assert refused.status_code == 409
        assert allowed.status_code == 200, allowed.content
        assert name_of(enquiry) == "Changed"

    def test_an_open_territory_s_records_are_untouched_by_another_closing(self, client):
        result, north, delhi, priya = setting()
        at_north = enquiry_at(north, name="North Customer")
        close_territory(territory=delhi)
        client.force_authenticate(user=priya.user)

        response = client.patch(
            enquiry_url(result, at_north), {"customer_name": "Changed"}, format="json"
        )

        assert response.status_code == 200, response.content

    def test_closing_a_region_freezes_its_own_records_not_its_dealer_s(self, client):
        result, north, delhi, _priya = setting()
        at_north = enquiry_at(north, name="North Customer")
        at_delhi = enquiry_at(delhi)
        close_territory(territory=north)
        client.force_authenticate(user=result.user)

        north_change = client.patch(
            enquiry_url(result, at_north), {"customer_name": "Changed"}, format="json"
        )
        delhi_change = client.patch(
            enquiry_url(result, at_delhi), {"customer_name": "Changed"}, format="json"
        )

        assert (north_change.status_code, delhi_change.status_code) == (409, 200)


class TestTheGuardItself:
    """Every way a record is written: save, create, delete, and a queryset's delete."""

    def test_create_save_delete_and_queryset_delete_are_refused(self):
        _result, _north, delhi, _priya = setting()
        enquiry = enquiry_at(delhi)
        token = closed_territories.set(frozenset({delhi.pk}))
        try:
            with tenant():
                # Each refusal in its own savepoint: a refused delete inside
                # Django's own atomic block would otherwise spoil the test's.
                def refused(write):
                    with pytest.raises(TerritoryClosedError):
                        with transaction.atomic(using=TEST_TENANT_ALIAS):
                            write()

                refused(
                    lambda: Enquiry.objects.create(
                        territory_id=delhi.pk,
                        customer_name="New",
                        phone="1",
                        created_by_user_id=uuid.uuid4(),
                    )
                )
                enquiry.customer_name = "Changed"
                refused(enquiry.save)
                refused(enquiry.delete)
                refused(Enquiry.objects.filter(pk=enquiry.pk).delete)
        finally:
            closed_territories.reset(token)

        assert name_of(enquiry) == "Sharma Farms"

    def test_outside_a_request_nothing_is_closed(self):
        """Shell, tasks, and Delete's record transfer are not refused."""
        assert closed_territories.get() == frozenset()
