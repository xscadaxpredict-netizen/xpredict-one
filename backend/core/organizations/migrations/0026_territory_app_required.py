"""
Every app has its own territory tree, step 3 of 3 (the owner, 2026-11-24):
`Territory.app` is required. `0025` marked every existing box; from here no
box can exist without saying whose tree it is in.

Control plane: a plain `migrate`.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("organizations", "0025_territory_app_trees")]

    operations = [
        migrations.AlterField(
            model_name="territory",
            name="app",
            field=models.ForeignKey(
                db_column="app",
                help_text="Whose tree this is: every app has its own (2026-11-24).",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="permissions.app",
                to_field="code",
            ),
        ),
    ]
