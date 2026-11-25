"""
DMS settings -> Security & Controls -> Position and Sharing -> Position (the
owner, 2026-11-25; C72 / C77 amended): DMS's reporting chart.

See the chart, add a position, edit one (its name, description, "Share records
with peers", and "Reports to" -- which moves it), delete one. Placing people at
a position is `dms.user.update`, as placing them at a territory is.

GRANTED TO NO ROLE, like `dms.user.*` and `dms.territory.*`: the owner holds
them by rule, and DMS settings are the owner's alone until the app-admin role
is designed (Q63).

Module `positions`. No section or action: DMS is outside the section tree until
the owner restructures it (C79, amended).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

PERMISSIONS = [
    ("dms.position.view", "positions", "Positions", "See DMS's position chart"),
    ("dms.position.create", "positions", "Positions", "Add a position to DMS's chart"),
    ("dms.position.update", "positions", "Positions", "Edit or move a position"),
    ("dms.position.delete", "positions", "Positions", "Delete a position"),
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
    dependencies = [("permissions", "0026_drop_dealer_permissions")]

    operations = [migrations.RunPython(add, remove)]
