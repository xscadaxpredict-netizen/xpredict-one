"""
Territory becomes a tree, step 1 of 3: add the columns (C72, Q56).

THREE MIGRATIONS, NOT ONE, because MySQL cannot roll DDL back (C39). Adding the
columns, filling them and then tightening them are separate steps, so a failure
in the middle leaves a state that re-running the next step can finish from --
rather than a half-applied migration Django believes never ran.

`path` arrives NULLABLE AND NOT UNIQUE: every existing row would otherwise
collide on the same empty value before `0011` has given each one its own.
`0012` makes it required and unique once it is filled.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0009_rename_businessunit_territory"),
    ]

    operations = [
        migrations.AddField(
            model_name="territory",
            name="kind",
            field=models.CharField(
                choices=[
                    ("region", "Region"),
                    ("dealer", "Dealer"),
                    ("branch", "Branch"),
                    ("warehouse", "Warehouse"),
                ],
                default="dealer",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="territory",
            name="path",
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="territory",
            name="depth",
            field=models.PositiveIntegerField(default=1),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="territory",
            name="numchild",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
