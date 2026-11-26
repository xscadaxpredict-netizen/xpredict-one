"""
`main`'s enquiry numbers (its 0015) are unique per DEALERSHIP: that rule named
`unit_id`. After this branch's 0016 renamed the column, it is per TERRITORY
(`territory_id`), under a name that says so. Merge of 2026-11-26. TENANT migration.

THE OLD RULE IS DROPPED BY NAME, IN SQL. Django's own `RemoveConstraint` builds
the DROP from the constraint's FIELDS, and in the migration state the old rule
still names `unit_id` -- a column 0016 had already renamed -- so it failed with
"Enquiry has no field named 'unit_id'" on every freshly provisioned database.
MySQL renamed the column inside the index itself, so dropping the index by its
name is all the database needs; the state is told separately.
"""

from django.db import migrations, models

TABLE = "dms_sales_enquiry"


class Migration(migrations.Migration):
    dependencies = [
        ("dms_sales", "0016_remove_confirmedsite_uq_site_unit_oc_number_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=f"ALTER TABLE `{TABLE}` DROP INDEX `uq_enquiry_unit_enquiry_no`",
                    reverse_sql=(
                        f"ALTER TABLE `{TABLE}` ADD CONSTRAINT `uq_enquiry_unit_enquiry_no` "
                        "UNIQUE (`territory_id`, `enquiry_no`)"
                    ),
                ),
            ],
            state_operations=[
                migrations.RemoveConstraint(model_name="enquiry", name="uq_enquiry_unit_enquiry_no"),
            ],
        ),
        migrations.AddConstraint(
            model_name="enquiry",
            constraint=models.UniqueConstraint(
                fields=("territory_id", "enquiry_no"), name="uq_enquiry_territory_enquiry_no"
            ),
        ),
    ]
