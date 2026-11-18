"""
The Admin panel's permissions, final (C79; the owner, 2026-11-18: "yes this is
final, record it and build").

1. NINE SPECIAL ACTIONS: view_users, view_conditional_assignment, deactivate,
   resend_invitation, assign_app, unassign_app, disable_app, assign_admin,
   unassign_admin.
2. THE USERS SECTION'S CODE: `person` -> `user`, to match its permissions.
3. SEVEN RENAMES, in place -- `RolePermission` points at the row, so every role
   holding one keeps it:
       admin.person.view               -> admin.user.view
       admin.person.invite             -> admin.user.create
       admin.person.update             -> admin.user.update
       admin.person.delete             -> admin.user.delete
       admin.person.set_status         -> admin.user.deactivate
       admin.person.resend_invitation  -> admin.user.resend_invitation
       admin.organization.view         -> admin.organization_info.view
4. THIRTEEN NEW PERMISSIONS -- application create / view_users /
   view_conditional_assignment; user assign_app / unassign_app / disable_app;
   admin view / assign_admin / unassign_admin; app_admin view; role create /
   update / delete -- all granted to the Organisation admin role. The DMS System
   administrator keeps exactly the Users permissions it had.
5. EVERY ONE OF THE 22 LINKED to its leaf section and action.

The 7 `admin.dealer.*` / `admin.territory.*` stay, unlinked. DMS is untouched.

WRITTEN OUT, NOT IMPORTED (`tests/test_migration_history.py`); `catalogue.py`
mirrors it. Historical models skip `save()`, so `test_actions.py` walks every
linked permission afterwards with `save()`'s rules.

Control plane: a plain `migrate`, no `migrate_all_tenants`.
"""

from __future__ import annotations

from django.db import migrations

ORG_ADMIN = "admin.org_admin"

# (code, name, display_order) -- all special.
SPECIAL_ACTIONS = [
    ("view_users", "View users", 5),
    ("view_conditional_assignment", "View conditional assignment", 6),
    ("deactivate", "Deactivate", 7),
    ("resend_invitation", "Resend invitation", 8),
    ("assign_app", "Assign app", 9),
    ("unassign_app", "Unassign app", 10),
    ("disable_app", "Disable app", 11),
    ("assign_admin", "Assign admin", 12),
    ("unassign_admin", "Unassign admin", 13),
]

SECTION_RENAME = ("person", "user")

RENAMES = [
    ("admin.person.view", "admin.user.view"),
    ("admin.person.invite", "admin.user.create"),
    ("admin.person.update", "admin.user.update"),
    ("admin.person.delete", "admin.user.delete"),
    ("admin.person.set_status", "admin.user.deactivate"),
    ("admin.person.resend_invitation", "admin.user.resend_invitation"),
    ("admin.organization.view", "admin.organization_info.view"),
]

# (code, module, group, label)
NEW = [
    ("admin.application.create", "applications", "Applications", "Add apps"),
    ("admin.application.view_users", "applications", "Applications", "See an app's members"),
    (
        "admin.application.view_conditional_assignment",
        "applications",
        "Applications",
        "See an app's conditional assignment",
    ),
    ("admin.user.assign_app", "users", "People", "Give somebody an app"),
    ("admin.user.unassign_app", "users", "People", "Take an app away from somebody"),
    ("admin.user.disable_app", "users", "People", "Disable somebody's app"),
    ("admin.admin.view", "roles", "Admins", "See the organisation's admins"),
    ("admin.admin.assign_admin", "roles", "Admins", "Make somebody an admin"),
    ("admin.admin.unassign_admin", "roles", "Admins", "Remove somebody's admin role"),
    ("admin.app_admin.view", "roles", "App admins", "See the app admins"),
    ("admin.role.create", "roles", "Roles", "Build a role"),
    ("admin.role.update", "roles", "Roles", "Edit a role"),
    ("admin.role.delete", "roles", "Roles", "Delete a role"),
]

# Every permission in the tree: code -> section code. Its action is the
# code's last part.
LINKS = {
    "admin.organization_info.view": "organization_info",
    "admin.application.view": "application",
    "admin.application.create": "application",
    "admin.application.view_users": "application",
    "admin.application.view_conditional_assignment": "application",
    "admin.user.view": "user",
    "admin.user.create": "user",
    "admin.user.update": "user",
    "admin.user.delete": "user",
    "admin.user.deactivate": "user",
    "admin.user.resend_invitation": "user",
    "admin.user.assign_app": "user",
    "admin.user.unassign_app": "user",
    "admin.user.disable_app": "user",
    "admin.admin.view": "admin",
    "admin.admin.assign_admin": "admin",
    "admin.admin.unassign_admin": "admin",
    "admin.app_admin.view": "app_admin",
    "admin.role.view": "role",
    "admin.role.create": "role",
    "admin.role.update": "role",
    "admin.role.delete": "role",
}

# What `0017` had linked, so going back restores exactly that.
LINKED_BY_0017 = {
    "admin.application.view",
    "admin.person.view",
    "admin.person.update",
    "admin.person.delete",
    "admin.role.view",
}


def add(apps, schema_editor):
    Action = apps.get_model("permissions", "Action")
    AppSection = apps.get_model("permissions", "AppSection")
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")

    for code, name, order in SPECIAL_ACTIONS:
        Action.objects.update_or_create(
            code=code, defaults={"name": name, "kind": "special", "display_order": order}
        )

    old, new = SECTION_RENAME
    AppSection.objects.filter(app_id="admin", code=old).update(code=new)

    for old, new in RENAMES:
        renamed = Permission.objects.filter(code=old).update(code=new)
        if renamed != 1:
            raise RuntimeError(f"0018 expected one permission {old!r}, found {renamed}.")

    org_admin = Role.objects.get(app_id="admin", code=ORG_ADMIN)
    for code, module, group, label in NEW:
        permission, _ = Permission.objects.update_or_create(
            code=code,
            defaults={"app_id": "admin", "module": module, "group": group, "label": label},
        )
        RolePermission.objects.get_or_create(role=org_admin, permission=permission)

    sections = {s.code: s for s in AppSection.objects.filter(app_id="admin")}
    for code, section in LINKS.items():
        linked = Permission.objects.filter(code=code).update(
            section=sections[section], action_id=code.rsplit(".", 1)[1]
        )
        if linked != 1:
            raise RuntimeError(f"0018 expected one permission {code!r}, found {linked}.")


def remove(apps, schema_editor):
    Action = apps.get_model("permissions", "Action")
    AppSection = apps.get_model("permissions", "AppSection")
    Permission = apps.get_model("permissions", "Permission")

    # Deleting a permission takes its RolePermission rows with it.
    Permission.objects.filter(code__in=[code for code, *_rest in NEW]).delete()
    for old, new in RENAMES:
        Permission.objects.filter(code=new).update(code=old)
    Permission.objects.filter(app_id="admin").exclude(code__in=LINKED_BY_0017).update(
        section=None, action=None
    )
    new, old = SECTION_RENAME[1], SECTION_RENAME[0]
    AppSection.objects.filter(app_id="admin", code=new).update(code=old)
    Action.objects.filter(code__in=[code for code, *_rest in SPECIAL_ACTIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0017_admin_panel_sections")]

    operations = [migrations.RunPython(add, remove)]
