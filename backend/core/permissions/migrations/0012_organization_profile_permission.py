"""
`admin.organization.view` -- see the organisation's profile (C78).

The Admin panel's Organization -> Profile page shows the organisation's name,
web address, owner, when it was created and whether its workspace is ready.
Until now it borrowed the `dealers` module as a stand-in gate; this gives it a
module of its own, `organization`, so a dealer admin's narrowed panel (C23)
never shows it and nothing else has to pretend to be it.

WHO HOLDS IT: the owner, by rule (C72), and the "Organisation admin" role --
added to that role HERE, in the same migration, as `catalogue.py` says every
new `admin.*` permission must be. A dealer admin does not: the DMS System
administrator role grants the `users` module only.

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`). `catalogue.py`
gains the same line in the same commit, for reading.
"""

from __future__ import annotations

from django.db import migrations

CODE = "admin.organization.view"
ROLE = "admin.org_admin"


def add(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")

    permission, _ = Permission.objects.update_or_create(
        code=CODE,
        defaults={
            "app_id": "admin",
            "module": "organization",
            "group": "Organization",
            "label": "See the organization's profile",
        },
    )
    role = Role.objects.get(app_id="admin", code=ROLE)
    RolePermission.objects.get_or_create(role=role, permission=permission)


def remove(apps, schema_editor):
    # Deleting the permission takes its RolePermission rows with it (CASCADE).
    apps.get_model("permissions", "Permission").objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0011_drop_appaccess")]

    operations = [migrations.RunPython(add, remove)]
