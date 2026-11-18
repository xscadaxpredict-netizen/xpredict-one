"""
The Admin panel's sections and actions, and its permissions linked to them (C79, step 2).

WHAT IT WRITES (the owner, 2026-11-18):

1. THE FOUR BASIC ACTIONS -- view, create, update, delete. "For now the actions
   table will have view, create, update and delete; later we'll add others as
   we go." So a permission whose verb is not one of the four (invite,
   set_status, resend_invitation...) stays UNLINKED until its action exists.
2. THE ADMIN PANEL'S SECTIONS:

       Organization (module)
         Profile (sub-module)
           Organization Info (tab)
       App Management (module)
         Applications (sub-module)
       User Management (module)
         Users (sub-module)
         Admins and Roles (sub-module)
           Admins / App Admins / Roles (tabs)

3. `admin.person.remove` BECOMES `admin.person.delete` -- the basic Delete for
   Users (C79, amended). The row's code changes in place, so every role holding
   it keeps it: `RolePermission` points at the row, not the code.
4. THE LINKS, for the permissions whose leaf and verb now both exist:
   applications' view; Users' view, update and delete; the Roles tab's view.

LEFT UNLINKED, on purpose: `admin.organization.view` (its tab's code is
`organization_info`, so linking it needs a rename the owner has not asked for),
Users' invite / set_status / resend_invitation (special verbs, not added yet),
and `admin.dealer.*` / `admin.territory.*` (the Dealers screen has no section).
No new permissions: the owner names them (the Admins and App Admins tabs have
none yet). DMS is untouched (C79, amended).

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`). Historical models
skip `save()`, so this migration sets each action's `kind` itself and builds the
tree parent first; `test_actions.py` walks every linked permission afterwards
and applies `save()`'s rules.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

# (code, name, display_order) -- all basic.
ACTIONS = [
    ("view", "View", 1),
    ("create", "Create", 2),
    ("update", "Update", 3),
    ("delete", "Delete", 4),
]

# (code, level, name, parent code, display_order), parents before children.
SECTIONS = [
    ("organization", "module", "Organization", None, 1),
    ("profile", "sub_module", "Profile", "organization", 1),
    ("organization_info", "tab", "Organization Info", "profile", 1),
    ("app_management", "module", "App Management", None, 2),
    ("application", "sub_module", "Applications", "app_management", 1),
    ("user_management", "module", "User Management", None, 3),
    ("person", "sub_module", "Users", "user_management", 1),
    ("admins_and_roles", "sub_module", "Admins and Roles", "user_management", 2),
    ("admin", "tab", "Admins", "admins_and_roles", 1),
    ("app_admin", "tab", "App Admins", "admins_and_roles", 2),
    ("role", "tab", "Roles", "admins_and_roles", 3),
]

RENAME = ("admin.person.remove", "admin.person.delete")

# permission code -> (section code, action code)
LINKS = {
    "admin.application.view": ("application", "view"),
    "admin.person.view": ("person", "view"),
    "admin.person.update": ("person", "update"),
    "admin.person.delete": ("person", "delete"),
    "admin.role.view": ("role", "view"),
}


def add(apps, schema_editor):
    Action = apps.get_model("permissions", "Action")
    AppSection = apps.get_model("permissions", "AppSection")
    Permission = apps.get_model("permissions", "Permission")

    for code, name, order in ACTIONS:
        Action.objects.update_or_create(
            code=code, defaults={"name": name, "kind": "basic", "display_order": order}
        )

    made = {}
    for code, level, name, parent, order in SECTIONS:
        made[code], _ = AppSection.objects.update_or_create(
            app_id="admin",
            code=code,
            defaults={
                "level": level,
                "name": name,
                "parent": made[parent] if parent else None,
                "display_order": order,
            },
        )

    old, new = RENAME
    Permission.objects.filter(code=old).update(code=new)

    for code, (section, action) in LINKS.items():
        updated = Permission.objects.filter(code=code).update(
            section=made[section], action_id=action
        )
        if updated != 1:
            raise RuntimeError(f"0017 expected one permission {code!r}, found {updated}.")


def remove(apps, schema_editor):
    Action = apps.get_model("permissions", "Action")
    AppSection = apps.get_model("permissions", "AppSection")
    Permission = apps.get_model("permissions", "Permission")

    Permission.objects.filter(code__in=LINKS).update(section=None, action=None)
    old, new = RENAME
    Permission.objects.filter(code=new).update(code=old)
    # Children before parents: a section with sections under it is protected.
    for code, *_rest in reversed(SECTIONS):
        AppSection.objects.filter(app_id="admin", code=code).delete()
    Action.objects.filter(code__in=[code for code, *_rest in ACTIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0016_action_kind")]

    operations = [migrations.RunPython(add, remove)]
