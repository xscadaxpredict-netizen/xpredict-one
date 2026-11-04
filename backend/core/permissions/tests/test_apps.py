"""
The `App` table (C71's first piece), checked against the rows the migration
seeds and the guarantees the foreign keys are there to give.

Like `test_catalogue.py`, every code and name is written out rather than read
back from `AppCode` --- comparing the module to itself passes for any content.
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from core.permissions.models import App, AppCode, Permission, Role
from core.permissions.registry import is_unit_aware

pytestmark = pytest.mark.django_db


class TestSeed:
    def test_the_four_apps_in_order(self):
        assert list(App.objects.values_list("code", "name")) == [
            ("admin", "Administration"),
            ("dms", "DMS"),
            ("crm", "CRM"),
            ("ecommerce", "E-commerce"),
        ]

    def test_the_enum_spells_exactly_the_table(self):
        """
        `AppCode` is how Python names these rows. An app added to one and not
        the other is a constant that points at nothing, or a row code cannot
        name --- this is the line that makes forgetting either fail.
        """
        assert set(App.objects.values_list("code", flat=True)) == set(AppCode.values)

    def test_only_dms_belongs_to_dealerships(self):
        """C5: DMS splits records by dealership; nothing else has dealerships."""
        assert list(App.objects.filter(unit_aware=True).values_list("code", flat=True)) == ["dms"]


class TestIsUnitAware:
    def test_reads_the_table(self):
        assert is_unit_aware(AppCode.DMS)
        assert not is_unit_aware(AppCode.CRM)
        assert not is_unit_aware(AppCode.ADMIN)

    def test_follows_the_row_not_a_constant(self):
        """
        The point of moving the fact: change the row and the answer changes.
        `UNIT_AWARE_APPS` would have gone on saying DMS alone.
        """
        App.objects.filter(code=AppCode.CRM).update(unit_aware=True)
        assert is_unit_aware(AppCode.CRM)

    def test_an_unknown_code_is_not_unit_aware(self):
        assert not is_unit_aware("inventory")


class TestForeignKeys:
    def test_existing_rows_still_store_the_code(self):
        """`to_field="code"`: the column reads 'dms', not a UUID, and no data moved."""
        role = Role.objects.get(code="dms.manager")
        assert role.app_id == "dms"
        assert role.app.name == "DMS"

    def test_mysql_refuses_an_app_that_does_not_exist(self):
        """
        What the foreign key buys. As a CharField with `choices`, a typo was
        validated only by forms, and a row written by code saved happily.
        """
        with pytest.raises(IntegrityError), transaction.atomic():
            Role.objects.create(
                app_id="dsm", code="dsm.typo", name="Typo", level="org", summary="Never saved."
            )

    def test_an_app_in_use_cannot_be_deleted(self):
        """PROTECT: deleting DMS would orphan its roles and permissions."""
        with pytest.raises(ProtectedError):
            App.objects.get(code=AppCode.DMS).delete()

    def test_filtering_by_code_still_works(self):
        """Callers that filter with `app=AppCode.DMS` did not have to change."""
        assert Permission.objects.filter(app=AppCode.CRM).count() == 1
