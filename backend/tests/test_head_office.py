"""
The head office is the organisation's ROOT territory (C82 amended, the owner
2026-11-23) -- Nishanth's head-office tests from `main` (C-local-4), kept
case for case and translated in the merge.

The organisation works in every DMS module itself, recorded at the root;
dealers work at their own territories. These pin the parts that are easy to
undo by accident: where an organisation-level person's work lands, and that the
head office never shows up as a dealer.

Moved here from `core/organizations/tests/`: it now files DMS records, and
`core` never imports `products` (import-linter's layers).
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction

from conftest import TEST_TENANT_ALIAS, add_dealer
from core.api import home_for
from core.organizations.models import Territory, TerritoryKind
from core.organizations.selectors import territory_tree
from core.organizations.services import _resolve_unit
from core.permissions.models import AppCode
from products.dms.sales.models import Customer
from shared.exceptions import NotFoundError
from tests.test_subtrees import found, person

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


def filed_at(result, membership=None, requested=None):
    """Where an enquiry-like record filed by `membership` (the owner by default) lands."""
    return home_for(
        Customer,
        membership=membership or result.membership,
        organization=result.organization,
        requested=requested,
        app=AppCode.DMS,
    )


def test_the_head_office_is_the_root_named_after_the_organisation_and_there_is_one():
    result = found(name="Sirish Motors")
    root = Territory.objects.root_for(result.organization, AppCode.DMS)

    assert root.is_root is True
    assert root.display_name == "Sirish Motors"
    assert Territory.objects.root_for(result.organization, AppCode.DMS).id == root.id


def test_the_database_refuses_a_second_head_office():
    """(organization, is_root) is unique: one root, so one head office."""
    result = found()
    root = Territory.objects.root_for(result.organization, AppCode.DMS)

    with pytest.raises(IntegrityError), transaction.atomic():
        Territory.objects.bulk_create(
            [
                Territory(
                    organization=result.organization,
                    kind=TerritoryKind.ORGANISATION,
                    name="Another",
                    is_root=True,
                    depth=1,
                    path=root.path + "Z",
                )
            ]
        )


def test_org_level_work_lands_in_the_head_office_even_with_no_dealers():
    result = found()

    assert filed_at(result) == Territory.objects.root_for(result.organization, AppCode.DMS).id


def test_org_level_work_does_not_fall_into_the_oldest_dealer():
    result = found()
    add_dealer(organization=result.organization, name="Chennai - Guindy")

    assert filed_at(result) == Territory.objects.root_for(result.organization, AppCode.DMS).id


def test_an_org_level_person_may_choose_a_dealer_of_their_own_org_only():
    result = found()
    other = found(code="CODE-OTHER", name="Other", email="owner@other.test")
    mine = add_dealer(organization=result.organization, name="Guindy")
    theirs = add_dealer(organization=other.organization, name="Foreign")
    root = Territory.objects.root_for(result.organization, AppCode.DMS).id

    assert filed_at(result, requested=str(mine.id)) == mine.id
    assert filed_at(result, requested=str(theirs.id)) == root
    assert filed_at(result, requested="not-a-uuid") == root


def test_a_dealer_user_always_works_in_their_own_dealer():
    result = found()
    mine = add_dealer(organization=result.organization, name="Guindy")
    clerk = person(result.organization, "clerk@apex.test", [mine], role="dms.sales_representative")

    assert filed_at(result, membership=clerk) == mine.id


def test_the_head_office_is_not_a_dealer():
    result = found()
    root = Territory.objects.root_for(result.organization, AppCode.DMS)
    add_dealer(organization=result.organization, name="Guindy")

    dealers = [t.name for t in territory_tree(result.organization) if t.kind == "dealer"]
    assert dealers == ["Guindy"]
    with pytest.raises(NotFoundError):
        _resolve_unit(result.organization, root.id)
