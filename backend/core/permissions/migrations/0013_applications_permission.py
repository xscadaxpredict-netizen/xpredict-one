"""
`admin.application.view` -- see the organisation's applications (C78).

The Admin panel's App Management -> Applications page lists every app with
whether the organisation subscribes to it, its owner and how many people can
open it. Until now the page borrowed the `dealers` module as a stand-in gate;
this gives it a module of its own, `applications`, so a dealer admin's
narrowed panel (C23) never shows it.

WHO HOLDS IT: the owner, by rule (C72), and the "Organisation admin" role --
added to that role HERE, in the same migration, as `catalogue.py` says every
new `admin.*` permission must be. A dealer admin does not.

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`). `catalogue.py`
gains the same line in the same commit, for reading.
"""

from __future__ import annotations

from django.db import migrations

CODE = "admin.application.view"
ROLE = "admin.org_admin"


def add(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")

    permission, _ = Permission.objects.update_or_create(
        code=CODE,
        defaults={
            "app_id": "admin",
            "module": "applications",
            "group": "Applications",
            "label": "See the organization's applications",
        },
    )
    role = Role.objects.get(app_id="admin", code=ROLE)
    RolePermission.objects.get_or_create(role=role, permission=permission)


def remove(apps, schema_editor):
    # Deleting the permission takes its RolePermission rows with it (CASCADE).
    apps.get_model("permissions", "Permission").objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0012_organization_profile_permission")]

    operations = [migrations.RunPython(add, remove)]
