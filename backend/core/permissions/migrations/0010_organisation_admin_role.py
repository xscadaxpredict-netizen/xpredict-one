"""
The "Organisation admin" role, in the Administration app (C72 step 2c, Q60).

Q60, answered by the owner on 2026-11-11: Administration ships ONE built-in
role, holding every `admin.*` permission -- today's "admin" standing turned
into a role somebody is given, like any other app's role. It is granted at the
organisation's root by `organizations/0019` (existing admins) and by the
services (new ones). Narrower Administration roles wait for C72 piece 5, when
organisations copy and edit roles themselves.

LEVEL `org`: roles still carry a level until after piece 3, and this one only
ever sits at the root.

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`): the 14 codes
are listed here as they are on the day this was written. `catalogue.py` gains
the same role in the same commit, for reading.
"""

from __future__ import annotations

from django.db import migrations

CODE = "admin.org_admin"

PERMISSIONS = [
    "admin.person.view",
    "admin.person.invite",
    "admin.person.update",
    "admin.person.remove",
    "admin.person.set_status",
    "admin.person.resend_invitation",
    "admin.dealer.view",
    "admin.dealer.create",
    "admin.dealer.update",
    "admin.dealer.set_status",
    "admin.territory.view",
    "admin.territory.create",
    "admin.territory.update",
    "admin.role.view",
]


def add(apps, schema_editor):
    Role = apps.get_model("permissions", "Role")
    Permission = apps.get_model("permissions", "Permission")
    RolePermission = apps.get_model("permissions", "RolePermission")

    role, _ = Role.objects.update_or_create(
        app_id="admin",
        code=CODE,
        defaults={
            "name": "Organisation admin",
            "level": "org",
            "summary": "Runs the organisation: its people, dealerships and territories.",
            "display_order": 0,
        },
    )
    permissions = list(Permission.objects.filter(code__in=PERMISSIONS))
    if len(permissions) != len(PERMISSIONS):
        missing = set(PERMISSIONS) - {p.code for p in permissions}
        raise RuntimeError(f"Permissions missing before 0010 could run: {sorted(missing)}")
    for permission in permissions:
        RolePermission.objects.get_or_create(role=role, permission=permission)


def remove(apps, schema_editor):
    apps.get_model("permissions", "Role").objects.filter(app_id="admin", code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0009_territory_permissions")]

    operations = [migrations.RunPython(add, remove)]
