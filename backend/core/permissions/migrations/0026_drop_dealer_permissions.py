"""
THE ADMIN PANEL'S DEALERS SCREEN IS GONE (the owner, 2026-11-25; Q79, C82):
dealers are territories, made and changed in DMS settings -> Territory
Management. Its four `admin.dealer.*` permissions and the three
`admin.territory.*` ones (the Admin panel's old territory endpoints, which no
screen ever called) go with it. Nothing on any screen checked them by then;
the screen had no sidebar link since C78.

Role grants of them are removed first (the link is PROTECT). REVERSE recreates the rows only -- the
grants are not restored.

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it. Control plane: a plain `migrate`.
"""

from __future__ import annotations

from django.db import migrations

GONE = [
    ("admin.dealer.view", "dealers", "Dealerships", "See the dealerships"),
    ("admin.dealer.create", "dealers", "Dealerships", "Add a dealership"),
    ("admin.dealer.update", "dealers", "Dealerships", "Edit a dealership"),
    ("admin.dealer.set_status", "dealers", "Dealerships", "Close or reopen a dealership"),
    ("admin.territory.view", "dealers", "Territories", "See the territory tree"),
    ("admin.territory.create", "dealers", "Territories", "Add a region, branch or warehouse"),
    ("admin.territory.update", "dealers", "Territories", "Rename or move a territory"),
]


def drop(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    RolePermission = apps.get_model("permissions", "RolePermission")
    codes = [code for code, *_ in GONE]
    # The grants first: `RolePermission.permission` is PROTECT, so a permission
    # still held by a role (the Organisation admin holds these) cannot go.
    RolePermission.objects.filter(permission__code__in=codes).delete()
    Permission.objects.filter(code__in=codes).delete()


def restore(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    for code, module, group, label in GONE:
        Permission.objects.update_or_create(
            code=code,
            defaults={"app_id": "admin", "module": module, "group": group, "label": label},
        )


class Migration(migrations.Migration):
    dependencies = [("permissions", "0025_dms_territory_delete")]

    operations = [migrations.RunPython(drop, restore)]
