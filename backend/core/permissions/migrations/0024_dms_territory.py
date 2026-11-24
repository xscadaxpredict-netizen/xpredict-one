"""
DMS settings -> Security & Controls -> Territory Management (the owner,
2026-11-24; C78 and C82 amended).

DMS's territory tree: see it, add a territory of any kind, edit a territory's
details, close and reopen one. Moving one comes later.

GRANTED TO NO ROLE, like `dms.user.*` (`0021`-`0023`): the owner holds them by
rule, and DMS settings are the owner's alone until the app-admin role is
designed (Q63).

Module `territories`. No section or action: DMS is outside the section tree
until the owner restructures it (C79, amended).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

PERMISSIONS = [
    ("dms.territory.view", "territories", "Territories", "See DMS's territory tree"),
    ("dms.territory.create", "territories", "Territories", "Add a territory to DMS's tree"),
    ("dms.territory.update", "territories", "Territories", "Edit a territory's details"),
    ("dms.territory.set_status", "territories", "Territories", "Close a territory, or reopen it"),
]


def add(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")

    for code, module, group, label in PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"app_id": "dms", "module": module, "group": group, "label": label},
        )


def remove(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Permission.objects.filter(code__in=[code for code, *_ in PERMISSIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0023_dms_user_manage")]

    operations = [migrations.RunPython(add, remove)]
