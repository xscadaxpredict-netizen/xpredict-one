"""
`dms.user.view` -- DMS settings -> Users & Roles -> Users (the owner,
2026-11-23; C78 amended).

Seeing everybody who holds DMS, with their role, places and status, on DMS's
own Users page behind the gear. GRANTED TO NO ROLE: the owner holds it by rule
(C72), and DMS settings are the owner's alone until the app-admin role is
designed (Q63). That role gets it in its own migration.

Module `users` -- DMS's Users sub-module, the bucket `/me` derives it into --
and NOT `settings`, which is Load Master Data's: a role given this later would
otherwise be handed that screen too. No section or action: DMS is outside the
section tree until the owner restructures it (C79, amended).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

PERMISSION = ("dms.user.view", "users", "Users", "See DMS's users")


def add(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")

    code, module, group, label = PERMISSION
    Permission.objects.update_or_create(
        code=code,
        defaults={"app_id": "dms", "module": module, "group": group, "label": label},
    )


def remove(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Permission.objects.filter(code=PERMISSION[0]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0020_custom_roles")]

    operations = [migrations.RunPython(add, remove)]
