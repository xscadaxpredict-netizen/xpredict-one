"""
`dms.user.create` -- DMS settings -> Users -> Invite User (the owner,
2026-11-24; C78 amended).

Inviting somebody INTO DMS: a person, with DMS and an organisation-level DMS
role on their invitation (`invite_to_app()`). GRANTED TO NO ROLE, like
`dms.user.view` (`0021`): the owner holds it by rule, and DMS settings are the
owner's alone until the app-admin role is designed (Q63).

Module `users`, the same as `0021`. No section or action: DMS is outside the
section tree until the owner restructures it (C79, amended).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

PERMISSION = ("dms.user.create", "users", "Users", "Invite somebody into DMS")


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
    dependencies = [("permissions", "0021_dms_user_view")]

    operations = [migrations.RunPython(add, remove)]
