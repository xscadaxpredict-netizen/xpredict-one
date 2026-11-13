"""
`unit_id` -> `territory_id` on this module's records (C72 piece 3, step 1).

The column holds the same value -- the id of the record's territory in the
control database (a dealership, today). Only the name changes, to match the
territory tree (CLAUDE.md: say "territory", never "unit"). Indexes and unique
constraints that named the column are dropped and rebuilt under the new name;
rows are untouched. The API still says `unit_id`/`X-Unit-Id` until piece 7.

A TENANT MIGRATION, and production's deploy only migrates the control database
(C69): run `manage.py migrate_all_tenants --plan`, then `migrate_all_tenants`,
on the server by hand, or every organisation's DMS pages 500.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dms_tech_support', '0002_callrequest_attachment_callrequest_attachment_name'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='callrequest',
            name='dms_tech_su_unit_id_7dec6b_idx',
        ),
        migrations.RemoveIndex(
            model_name='callrequest',
            name='dms_tech_su_unit_id_e7da3d_idx',
        ),
        migrations.RenameField(
            model_name='callrequest',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.AddIndex(
            model_name='callrequest',
            index=models.Index(fields=['territory_id', 'status'], name='dms_tech_su_territo_6a6438_idx'),
        ),
        migrations.AddIndex(
            model_name='callrequest',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_tech_su_territo_ddfa92_idx'),
        ),
    ]
