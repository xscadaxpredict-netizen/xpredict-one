"""
Remove `dms.timer_calculation.delete` and its grants (2026-11-25).

The Timer Calculation feature was removed at the owner's request: its screen,
its endpoints and the `TimerCalculation` table (dms_tools 0010). The only
endpoint that checked this code is gone, so a grant of it would show on the
Roles page and do nothing.

Written out rather than imported from `catalogue.py`, for 0004's reason: a
migration is frozen history. Idempotent, and reversible --- the reverse puts
the code and 0004's grants (`dms.manager`, `dms.group_operations`) back.
"""

from __future__ import annotations

from django.db import migrations

CODE = "dms.timer_calculation.delete"
ROW = {"app": "dms", "module": "tools", "group": "Calculator", "label": "Remove a saved calculation"}
GRANTED_TO = ["dms.manager", "dms.group_operations"]


def withdraw(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    RolePermission = apps.get_model("permissions", "RolePermission")
    # RolePermission.permission is PROTECT, so the grants go first.
    RolePermission.objects.filter(permission__code=CODE).delete()
    Permission.objects.filter(code=CODE).delete()


def restore(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")
    permission, _ = Permission.objects.update_or_create(code=CODE, defaults=ROW)
    for role in Role.objects.filter(code__in=GRANTED_TO):
        RolePermission.objects.get_or_create(role=role, permission=permission)


class Migration(migrations.Migration):
    dependencies = [("permissions", "0004_dms_library_tools_and_store_orders")]

    operations = [migrations.RunPython(withdraw, restore)]
