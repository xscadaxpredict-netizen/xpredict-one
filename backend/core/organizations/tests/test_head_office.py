"""
Every organisation has its own working unit, the head office (C-local-4).

The organisation works in every DMS module itself, recorded in the head office;
dealers work in their own units. These pin the parts that are easy to undo by
accident: where an organisation-level request lands, and that the head office
never shows up as a dealer.
"""

from __future__ import annotations

import types

import pytest
from django.db import IntegrityError, transaction

from conftest import TEST_TENANT_ALIAS
from core.api import TenantAPIView
from core.organizations.models import BusinessUnit, Organization, OrganizationStatus
from core.organizations.selectors import dealers_for
from core.organizations.services import _resolve_unit, create_dealer, head_office_for
from shared.exceptions import NotFoundError

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


def _org(
    slug: str = "head-office-org", name: str = "Sirish Motors", db_name: str = TEST_TENANT_ALIAS
) -> Organization:
    return Organization.objects.create(
        name=name,
        slug=slug,
        db_name=db_name,
        db_host="127.0.0.1",
        db_port=3306,
        status=OrganizationStatus.ACTIVE,
    )


def _request(unit_id=None, header=None):
    return types.SimpleNamespace(
        membership=types.SimpleNamespace(unit_id=unit_id),
        headers={"X-Unit-Id": header} if header else {},
    )


def test_head_office_is_named_after_the_org_and_created_once():
    org = _org()
    first = head_office_for(org)
    assert first.is_head_office is True
    assert first.name == "Sirish Motors"
    assert head_office_for(org).id == first.id


def test_a_dealer_already_holding_the_name_suffixes_the_head_office():
    org = _org()
    BusinessUnit.objects.create(organization=org, name="Sirish Motors")
    assert head_office_for(org).name == "Sirish Motors (Head office)"


def test_the_database_refuses_a_second_head_office():
    org = _org()
    head_office_for(org)
    with pytest.raises(IntegrityError), transaction.atomic():
        BusinessUnit.objects.create(organization=org, name="Another", is_head_office=True)


def test_org_level_work_lands_in_the_head_office_even_with_no_dealers():
    org = _org()
    assert TenantAPIView._resolve_unit_id(_request(), org) == head_office_for(org).id


def test_org_level_work_does_not_fall_into_the_oldest_dealer():
    org = _org()
    create_dealer(organization=org, name="Chennai - Guindy")
    assert TenantAPIView._resolve_unit_id(_request(), org) == head_office_for(org).id


def test_an_org_level_person_may_choose_a_dealer_of_their_own_org_only():
    org, other = _org(), _org(slug="other-org", name="Other", db_name="xpredict_other_org")
    mine = create_dealer(organization=org, name="Guindy")
    theirs = create_dealer(organization=other, name="Foreign")
    head_office = head_office_for(org).id
    assert TenantAPIView._resolve_unit_id(_request(header=str(mine.id)), org) == mine.id
    assert TenantAPIView._resolve_unit_id(_request(header=str(theirs.id)), org) == head_office
    assert TenantAPIView._resolve_unit_id(_request(header="not-a-uuid"), org) == head_office


def test_a_dealer_user_always_works_in_their_own_dealer():
    org = _org()
    mine = create_dealer(organization=org, name="Guindy")
    assert TenantAPIView._resolve_unit_id(_request(unit_id=mine.id), org) == mine.id


def test_the_head_office_is_not_a_dealer():
    org = _org()
    head_office = head_office_for(org)
    create_dealer(organization=org, name="Guindy")
    assert [u.name for u in dealers_for(org)] == ["Guindy"]
    with pytest.raises(NotFoundError):
        _resolve_unit(org, head_office.id)

