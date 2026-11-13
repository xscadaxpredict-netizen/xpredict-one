"""
The dealership Tech support role does not hold the organisation library (C67).

Two separate things had to be put right, and each has its own test here:

- `permissions/0008` removes the two grants from every database that was built
  from scratch between 2026-10-15 and 2026-11-05 and so received them. The
  suite's own database is built from the frozen `0002` now and never has them,
  so the test PLANTS them and runs the migration's function -- otherwise it
  would pass whether the function did anything or not.
- `catalogue.py`, which no migration reads any more but which is still the
  readable statement of what each role grants, must not say otherwise.
"""

from __future__ import annotations

import importlib

import pytest
from django.apps import apps as django_apps
from django.db import connection
from django.db.migrations.loader import MigrationLoader

from core.permissions import catalogue
from core.permissions.models import Permission, Role, RolePermission

pytestmark = pytest.mark.django_db

MIGRATION = "0008_withdraw_tech_support_library_grants"
LIBRARY = {
    "dms.manual.manage",
    "dms.video.manage",
    "dms.marketing_asset.manage",
    "dms.calculator.manage",
}


def _codes(role_code: str) -> set[str]:
    return set(
        RolePermission.objects.filter(role__code=role_code).values_list(
            "permission__code", flat=True
        )
    )


class TestTheMigration:
    def test_it_is_applied(self):
        """A migration nobody registered fixes nothing; this one must be in the history."""
        applied = MigrationLoader(connection).applied_migrations

        assert ("permissions", MIGRATION) in applied

    def test_it_removes_exactly_the_two_stray_grants(self):
        tech_support = Role.objects.get(code="dms.tech_support")
        for code in ("dms.manual.manage", "dms.video.manage"):
            RolePermission.objects.create(
                role=tech_support, permission=Permission.objects.get(code=code)
            )
        before = _codes("dms.tech_support")
        group_ops_before = _codes("dms.group_operations")
        assert {"dms.manual.manage", "dms.video.manage"} <= before  # planted

        module = importlib.import_module(f"core.permissions.migrations.{MIGRATION}")
        module.withdraw(django_apps, None)

        assert _codes("dms.tech_support") == before - {"dms.manual.manage", "dms.video.manage"}
        # Seven left: the six ticket codes and dms.customer.view -- what
        # production's Tech support has always held.
        assert len(_codes("dms.tech_support")) == 7
        # The organisation-level role keeps the library. Withdrawing by
        # permission alone, without the role, would have taken it from here too.
        assert _codes("dms.group_operations") == group_ops_before
        assert LIBRARY <= _codes("dms.group_operations")

    def test_running_it_twice_is_harmless(self):
        """MySQL cannot roll a failed migration back (C39), so a re-run must be safe."""
        module = importlib.import_module(f"core.permissions.migrations.{MIGRATION}")
        before = set(RolePermission.objects.values_list("role__code", "permission__code"))

        module.withdraw(django_apps, None)
        module.withdraw(django_apps, None)

        assert set(RolePermission.objects.values_list("role__code", "permission__code")) == before


class TestTheCatalogueAgrees:
    """
    `catalogue.py` FEEDS NO DATABASE NOW, so nothing else would notice it
    drifting. It is what a person reads to learn what a role grants, and what
    C71 piece 2 is written against -- a file that says Tech support may edit
    the library would have been copied straight into the next migration.
    """

    def test_tech_support_is_tickets_and_customer_lookup(self):
        _name, _app, _level, _summary, granted = catalogue.ROLES["dms.tech_support"]

        assert set(granted) == {
            "dms.ticket.view",
            "dms.ticket.create",
            "dms.ticket.update",
            "dms.ticket.assign",
            "dms.ticket.close",
            "dms.ticket.export",
            "dms.customer.view",
        }

    def test_no_dealer_role_in_the_catalogue_lists_the_library(self):
        for code, (_name, _app, level, _summary, granted) in catalogue.ROLES.items():
            if level == "unit":
                assert not set(granted) & LIBRARY, code
