"""
DMS settings -> Territory Management -> Delete territory (the owner,
2026-11-24; C82 amended): its DMS records are transferred and its people moved
to another territory, then it is deleted -- for good.

ITS OWN PERMISSION, apart from `dms.territory.update`: it cannot be undone.
GRANTED TO NO ROLE, like the rest of `dms.territory.*` (`0024`): the owner
alone, until the app-admin role is designed (Q63).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it. Control plane: a plain `migrate`.
"""

from __future__ import annotations

from django.db import migrations

PERMISSIONS = [
    (
        "dms.territory.delete",
        "territories",
        "Territories",
        "Delete a territory, moving its records and people",
    ),
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
    dependencies = [("permissions", "0024_dms_territory")]

    operations = [migrations.RunPython(add, remove)]
