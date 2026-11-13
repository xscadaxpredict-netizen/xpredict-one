"""
Territory becomes a tree, step 3 of 3: `path` is required and unique.

Safe only after `0011` has given every row its own path. On MySQL a unique
index on a 255-character utf8mb4 column is 1,020 bytes, inside InnoDB's 3,072
limit. The path alphabet is digits and capital letters only, so the
case-insensitive collation cannot make two different paths compare equal.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0011_territory_paths"),
    ]

    operations = [
        migrations.AlterField(
            model_name="territory",
            name="path",
            field=models.CharField(max_length=255, unique=True),
        ),
    ]
