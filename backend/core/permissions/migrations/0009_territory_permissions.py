"""
Three permissions for arranging the territory tree (C72 piece 1).

`admin.territory.view`, `.create` and `.update` -- see the tree, add a region,
branch or warehouse, and rename or move any territory. Separate from
`admin.dealer.*` because a dealership is one kind of territory with its own
details (GSTIN, contact, address) and its own screen; arranging the tree is a
different act from editing a dealership's address.

IN THE `dealers` MODULE, deliberately. A module is what makes a screen appear
(C42), and the tree is shown where dealerships are today; a new module would
put a new item in Administration's sidebar that leads nowhere until the
frontend piece (C72 piece 7).

WHO HOLDS THEM: owners and organisation admins, automatically -- standing
confers every `admin.*` permission by reading this table (C42), so there is no
grant to write. A dealer admin does NOT: the DMS System administrator role
grants the `users` module only, so a dealership cannot redraw the
organisation's tree. When C72 piece 2 turns "admin" into Administration roles,
these are granted like any other permission.

WRITTEN OUT, NOT IMPORTED, like `0004` and `0008`: a migration that reads
`catalogue.py` replays whatever the catalogue says later
(`tests/test_migration_history.py`). `catalogue.py` gains the same three lines
in the same commit.
"""

from __future__ import annotations

from django.db import migrations

# (code, app, module, group, label)
NEW_PERMISSIONS: list[tuple[str, str, str, str, str]] = [
    ("admin.territory.view", "admin", "dealers", "Territories", "See the territory tree"),
    (
        "admin.territory.create",
        "admin",
        "dealers",
        "Territories",
        "Add a region, branch or warehouse",
    ),
    (
        "admin.territory.update",
        "admin",
        "dealers",
        "Territories",
        "Rename or move a territory",
    ),
]


def add(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    for code, app, module, group, label in NEW_PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"app_id": app, "module": module, "group": group, "label": label},
        )


def remove(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Permission.objects.filter(code__in=[code for code, *_rest in NEW_PERMISSIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0008_withdraw_tech_support_library_grants")]

    operations = [migrations.RunPython(add, remove)]
