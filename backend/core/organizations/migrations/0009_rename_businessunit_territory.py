"""
`BusinessUnit` becomes `Territory` (C72, the owner's naming, 2026-11-06).

A RENAME, NOT A NEW TABLE. Rows, ids and every foreign key pointing here
(`Membership.unit`, `Invitation.unit`) are untouched; MySQL's `RENAME TABLE`
carries the foreign keys with it. Tenant tables refer to a territory by a plain
`unit_id` UUID with no foreign key (C1), so nothing outside the control
database notices.

THE CONSTRAINTS ARE RENAMED TOO, so nothing in Workbench still says "unit".
The new ones are added BEFORE the old ones are dropped: for the moment between
the two steps the table carries both, rather than neither -- which on a live
table would be a window in which two dealerships could share a name.

Written by hand because `makemigrations` asks interactively whether a
disappearing model and an appearing one are a rename; `makemigrations --check`
confirms this describes the models exactly.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0008_app_foreign_key"),
    ]

    operations = [
        migrations.RenameModel(old_name="BusinessUnit", new_name="Territory"),
        migrations.AlterField(
            model_name="territory",
            name="organization",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name="territories",
                to="organizations.organization",
            ),
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(
                fields=("organization", "code"), name="territory_unique_org_code"
            ),
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(
                fields=("organization", "name"), name="territory_unique_org_name"
            ),
        ),
        migrations.RemoveConstraint(model_name="territory", name="unit_unique_org_code"),
        migrations.RemoveConstraint(model_name="territory", name="unit_unique_org_name"),
    ]
