"""
DMS settings -> Users: a row's Edit, Deactivate and Delete (the owner,
2026-11-24; C78 amended).

All three act on the person's DMS, not their whole account (the owner's
choice): Edit changes their basic information and DMS role, Deactivate switches
their DMS off (the app tile's Disable), Delete takes DMS away (the app tile's
Unassign).

GRANTED TO NO ROLE, like `dms.user.view` (`0021`) and `dms.user.create`
(`0022`): the owner holds them by rule, and DMS settings are the owner's alone
until the app-admin role is designed (Q63).

Module `users`. No section or action: DMS is outside the section tree until
the owner restructures it (C79, amended).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

PERMISSIONS = [
    ("dms.user.update", "users", "Users", "Edit somebody's details and DMS role"),
    ("dms.user.deactivate", "users", "Users", "Switch somebody's DMS off or back on"),
    ("dms.user.delete", "users", "Users", "Take DMS away from somebody"),
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
    dependencies = [("permissions", "0022_dms_user_create")]

    operations = [migrations.RunPython(add, remove)]
