"""
The organisation becomes the root of its territory tree, step 1 of 3 (C72,
the owner, 2026-11-06): the `organisation` kind and the `is_root` marker.

Nullable, and no constraints yet -- `0014` creates the roots and moves every
existing territory under one, and `0015` only then switches on the rules the
data would not yet satisfy. Three steps because MySQL cannot roll DDL back.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0012_territory_path_required"),
    ]

    operations = [
        migrations.AddField(
            model_name="territory",
            name="is_root",
            field=models.BooleanField(
                blank=True,
                editable=False,
                help_text="True for the organisation's root box, NULL for every other. Never set by hand.",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="territory",
            name="kind",
            field=models.CharField(
                choices=[
                    ("organisation", "Organisation"),
                    ("region", "Region"),
                    ("dealer", "Dealer"),
                    ("branch", "Branch"),
                    ("warehouse", "Warehouse"),
                ],
                default="dealer",
                max_length=20,
            ),
        ),
    ]
