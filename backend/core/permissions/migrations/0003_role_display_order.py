"""
Give `Role` an explicit display order, and backfill it from the catalogue.

WHY THE ALPHABET WAS NOT GOOD ENOUGH. `ordering` ended in `name`, which sorted
the six dealership roles as Manager, Sales representative, Service advisor,
System administrator, Tech support, Technician -- separating the two roles that
run a dealership, which C36 deliberately created as a pair, and putting "Tech
support" ahead of "Technician". The frontend's tests had already pinned the
intended order; the backend simply did not share it, and `roles.ts` returns
whatever order the server sends.

STORED RATHER THAN SORTED IN PYTHON, following C44's reasoning: the order is
readable in Workbench rather than only by somebody who opens `catalogue.py`.

Idempotent and reversible, like `0002`, and for the same reasons -- MySQL
cannot roll a failed migration back (C39), so re-running has to be safe.
"""

from __future__ import annotations

from django.db import migrations, models

from core.permissions.catalogue import ROLES


def set_display_order(apps, schema_editor):
    """
    Number the roles in the order `catalogue.py` declares them.

    ONE GLOBAL SEQUENCE rather than restarting per app and level. `ordering` is
    `app, level, display_order`, so only the order WITHIN a group is ever read
    and a global counter preserves it -- while being obviously monotonic to
    anybody reading the table, which a set of restarting sequences is not.

    A role the catalogue no longer declares keeps whatever it had. It is not
    this migration's business to tidy up rows `0002` would have removed.
    """
    Role = apps.get_model("permissions", "Role")

    for position, code in enumerate(ROLES, start=1):
        Role.objects.filter(code=code).update(display_order=position)


def clear_display_order(apps, schema_editor):
    """
    Back to the column default, so reversing leaves the table as
    `AddField` found it rather than half-populated.
    """
    Role = apps.get_model("permissions", "Role")
    Role.objects.update(display_order=0)


class Migration(migrations.Migration):
    dependencies = [
        ("permissions", "0002_seed_catalogue"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="role",
            options={"ordering": ["app", "level", "display_order", "name"]},
        ),
        migrations.AddField(
            model_name="role",
            name="display_order",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Order within one app and level. Seeded from the catalogue.",
            ),
        ),
        migrations.RunPython(set_display_order, clear_display_order),
    ]
