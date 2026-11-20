"""
`admin.user.edit_app` -- the app tile's Edit (the owner, 2026-11-20, amending
C79's final list).

The tile's Edit changes the ROLE somebody holds in one app. It had borrowed
`admin.user.update`, which is Edit user -- a person's name and email -- so
anybody allowed to fix a spelling could also change what somebody does in an
app, a dealer admin included (the DMS System administrator holds `update`).
Now it is its own permission, beside its siblings `disable_app` and
`unassign_app`.

1. One SPECIAL action, `edit_app` ("Edit app").
2. One permission, `admin.user.edit_app`, linked to the Users section and that
   action, granted to the Organisation admin role. The owner holds it by rule;
   the DMS System administrator does not get it, like `assign_app`,
   `disable_app` and `unassign_app`.

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

ORG_ADMIN = "admin.org_admin"

ACTION = ("edit_app", "Edit app", 14)
PERMISSION = ("admin.user.edit_app", "users", "People", "Change somebody's role in an app")
SECTION = "user"


def add(apps, schema_editor):
    Action = apps.get_model("permissions", "Action")
    AppSection = apps.get_model("permissions", "AppSection")
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")

    action_code, action_name, order = ACTION
    action, _ = Action.objects.update_or_create(
        code=action_code,
        defaults={"name": action_name, "kind": "special", "display_order": order},
    )

    code, module, group, label = PERMISSION
    permission, _ = Permission.objects.update_or_create(
        code=code,
        defaults={
            "app_id": "admin",
            "module": module,
            "group": group,
            "label": label,
            "section": AppSection.objects.get(app_id="admin", code=SECTION),
            "action": action,
        },
    )
    RolePermission.objects.get_or_create(
        role=Role.objects.get(app_id="admin", code=ORG_ADMIN), permission=permission
    )


def remove(apps, schema_editor):
    Action = apps.get_model("permissions", "Action")
    Permission = apps.get_model("permissions", "Permission")

    # Deleting the permission takes its RolePermission rows with it.
    Permission.objects.filter(code=PERMISSION[0]).delete()
    Action.objects.filter(code=ACTION[0]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0018_admin_panel_permissions")]

    operations = [migrations.RunPython(add, remove)]
