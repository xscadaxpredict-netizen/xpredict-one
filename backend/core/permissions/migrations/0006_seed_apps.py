"""
Seed the four apps (C71).

THE ROWS ARE INLINE, not read from `AppCode`. 0002 imports the catalogue and
says why that is a compromise: a migration is supposed to be frozen history.
Four rows are short enough to freeze, so this one is.

EVERY CODE ALREADY IN USE MUST BE HERE before the next migration turns the
`app` columns into foreign keys, or MySQL refuses to add the constraint over
rows that point at nothing. `ecommerce` is seeded for that reason only ---
`AppCode` has listed it since Phase 1 --- and `unit_aware=False` matches what
`is_unit_aware()` already answered for it. Nothing about E-commerce is designed
by this (Q15).

IDEMPOTENT AND REVERSIBLE, for 0002's reasons: MySQL cannot roll a failed
migration back (C39), so re-running has to be safe.
"""

from __future__ import annotations

from django.db import migrations

APPS = [
    # code, name, unit_aware, display_order
    ("admin", "Administration", False, 0),
    ("dms", "DMS", True, 1),
    ("crm", "CRM", False, 2),
    ("ecommerce", "E-commerce", False, 3),
]


def seed(apps, schema_editor):
    App = apps.get_model("permissions", "App")
    for code, name, unit_aware, display_order in APPS:
        App.objects.update_or_create(
            code=code,
            defaults={"name": name, "unit_aware": unit_aware, "display_order": display_order},
        )


def unseed(apps, schema_editor):
    App = apps.get_model("permissions", "App")
    App.objects.filter(code__in=[code for code, *_ in APPS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("permissions", "0005_app"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
