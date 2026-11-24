"""
Every app has its own territory tree, step 1 of 3 (the owner, 2026-11-24):
add `Territory.app`, nullable for now, and make the uniqueness rules per app.

THE NEW RULES ARE ADDED BEFORE THE OLD ONES ARE DROPPED. MySQL needs an index
leading with `organization` for its foreign key at every moment, and each new
rule leads with it; dropping first could leave the key without one.

NULL `app` IS DISTINCT IN A UNIQUE INDEX, so the new rules hold harmlessly over
the still-unmarked rows until `0025` marks them and `0026` makes the column
required.

Control plane: a plain `migrate`.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0023_grant_status"),
        ("permissions", "0023_dms_user_manage"),
    ]

    operations = [
        migrations.AddField(
            model_name="territory",
            name="app",
            field=models.ForeignKey(
                db_column="app",
                null=True,
                help_text="Whose tree this is: every app has its own (2026-11-24).",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="permissions.app",
                to_field="code",
            ),
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(
                fields=("organization", "app", "is_root"), name="territory_one_root_per_org_app"
            ),
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(
                fields=("organization", "app", "code"), name="territory_unique_org_app_code"
            ),
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(
                fields=("organization", "app", "name"), name="territory_unique_org_app_name"
            ),
        ),
        migrations.RemoveConstraint(model_name="territory", name="territory_one_root_per_org"),
        migrations.RemoveConstraint(model_name="territory", name="territory_unique_org_code"),
        migrations.RemoveConstraint(model_name="territory", name="territory_unique_org_name"),
    ]
