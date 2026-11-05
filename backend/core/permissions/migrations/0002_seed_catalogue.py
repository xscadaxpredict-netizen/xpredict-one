"""
Seed the permission catalogue and the nine built-in roles (C42, C44).

IDEMPOTENT AND REVERSIBLE, both on purpose. Idempotent because a seed that only
works on an empty table cannot be re-run after a partial failure, and MySQL
cannot roll a failed migration back (C39) -- so "run it again" has to be safe.
Reversible because a migration that cannot be undone pins every environment at
this version the moment anything goes wrong.

IT READS A FROZEN COPY OF THE CATALOGUE, `_catalogue_2026_10_03.py`, not the
live `catalogue.py` it used to import. Importing a module that keeps changing
meant every database built from scratch replayed TODAY's catalogue here, and
after `c87b376` that handed the dealership-level Tech support role two
organisation-library permissions that production never had. The frozen file is
the list this migration actually ran against on 2026-10-03; its docstring has
the whole story.
"""

from __future__ import annotations

from django.db import migrations

from core.permissions.migrations._catalogue_2026_10_03 import PERMISSIONS, ROLES


def seed(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")

    # update_or_create rather than create: the row may already be here from an
    # earlier partial run, and the label or group may have changed since.
    permissions = {}
    for code, app, module, group, label in PERMISSIONS:
        permission, _ = Permission.objects.update_or_create(
            code=code,
            defaults={"app": app, "module": module, "group": group, "label": label},
        )
        permissions[code] = permission

    for code, (name, app, level, summary, granted) in ROLES.items():
        role, _ = Role.objects.update_or_create(
            app=app,
            code=code,
            defaults={"name": name, "level": level, "summary": summary},
        )

        wanted = {permissions[permission_code] for permission_code in granted}
        held = {link.permission for link in RolePermission.objects.filter(role=role)}

        for permission in wanted - held:
            RolePermission.objects.create(role=role, permission=permission)

        # A permission REMOVED from a role has to go, or re-running this after
        # narrowing a role leaves the old grant in place and the role keeps a
        # capability the catalogue says it lost.
        RolePermission.objects.filter(
            role=role, permission__in=[p.id for p in held - wanted]
        ).delete()


def unseed(apps, schema_editor):
    """
    Remove only what this migration created.

    Scoped to the catalogue's own codes rather than emptying the tables: if
    anything else ever lands in them, a blanket delete takes that with it.
    """
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")

    Role.objects.filter(code__in=ROLES.keys()).delete()
    Permission.objects.filter(code__in=[code for code, *_rest in PERMISSIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
