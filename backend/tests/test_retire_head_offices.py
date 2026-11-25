"""
`manage.py retire_head_offices` (the merge of `main`, 2026-11-23): `main`'s
head offices fold into each organisation's ROOT, which is the head office now
(C82 amended).

What matters: the organisation's own records move to the root and nothing
else moves; nothing changes when a person is placed at the head office; it can
run twice; and until it runs, the head-office row is not a dealership.
"""

from __future__ import annotations

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.organizations.models import Organization, Territory, TerritoryKind
from core.permissions.models import AppCode
from products.dms.sales.models import Customer
from shared.base_models import territory_scope
from tests.test_subtrees import build_tree, found, person

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


@pytest.fixture
def acme():
    result = found(tenant=True)
    Organization.objects.filter(pk=result.organization.pk).update(provisioned_at=timezone.now())
    return Organization.objects.get(pk=result.organization.pk)


def head_office(organization) -> Territory:
    """A row the way `main`'s migration 0008 left it, after this branch's tree moved it."""
    return Territory.objects.create(
        organization=organization,
        kind=TerritoryKind.DEALER,
        name=f"{organization.name} (Head office)",
        is_head_office=True,
    )


def customers_at(territory_id) -> list[str]:
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        with territory_scope(None):
            return sorted(
                Customer.objects.filter(territory_id=territory_id).values_list("name", flat=True)
            )
    finally:
        current_tenant_db.reset(token)


def file_customer(name, territory_id) -> None:
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        with territory_scope(None):
            Customer.objects.create(name=name, territory_id=territory_id)
    finally:
        current_tenant_db.reset(token)


def test_the_head_offices_records_move_to_the_root_and_nothing_else_moves(acme):
    tree = build_tree(acme)
    head = head_office(acme)
    root = Territory.objects.root_for(acme, AppCode.DMS)
    file_customer("Head office customer", head.id)
    file_customer("Delhi customer", tree.delhi.id)

    call_command("retire_head_offices")

    assert customers_at(root.id) == ["Head office customer"]
    assert customers_at(tree.delhi.id) == ["Delhi customer"]
    assert not Territory.objects.filter(pk=head.pk).exists()


def test_plan_changes_nothing(acme):
    head = head_office(acme)
    file_customer("Head office customer", head.id)

    call_command("retire_head_offices", "--plan")

    assert customers_at(head.id) == ["Head office customer"]
    assert Territory.objects.filter(pk=head.pk).exists()


def test_it_can_run_twice(acme):
    head_office(acme)
    call_command("retire_head_offices")

    call_command("retire_head_offices")  # nothing left: no error

    assert not Territory.objects.filter(organization=acme, is_head_office=True).exists()


def test_it_refuses_when_somebody_is_placed_at_the_head_office(acme):
    """`main` never confined anybody there -- so this means something unexpected."""
    head = head_office(acme)
    person(acme, "ravi@apex.test", [head])
    file_customer("Head office customer", head.id)

    with pytest.raises(CommandError):
        call_command("retire_head_offices")

    assert customers_at(head.id) == ["Head office customer"]
    assert Territory.objects.filter(pk=head.pk).exists()

