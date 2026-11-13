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
        ('dms_ecommerce', '0001_initial'),
        ('dms_sales', '0005_unit_id_to_territory_id'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='ecommerceorder',
            name='dms_ecommer_unit_id_a180ff_idx',
        ),
        migrations.RemoveIndex(
            model_name='ecommerceorder',
            name='dms_ecommer_unit_id_21166f_idx',
        ),
        migrations.RemoveIndex(
            model_name='ecommerceorder',
            name='dms_ecommer_unit_id_4bf4cd_idx',
        ),
        migrations.RemoveIndex(
            model_name='ecommerceorderitem',
            name='dms_ecommer_unit_id_030cec_idx',
        ),
        migrations.RenameField(
            model_name='ecommerceorder',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='ecommerceorderitem',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.AddIndex(
            model_name='ecommerceorder',
            index=models.Index(fields=['territory_id', 'status'], name='dms_ecommer_territo_ad7154_idx'),
        ),
        migrations.AddIndex(
            model_name='ecommerceorder',
            index=models.Index(fields=['territory_id', '-placed_at'], name='dms_ecommer_territo_b6c705_idx'),
        ),
        migrations.AddIndex(
            model_name='ecommerceorder',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_ecommer_territo_a660dc_idx'),
        ),
        migrations.AddIndex(
            model_name='ecommerceorderitem',
            index=models.Index(fields=['territory_id', 'order_id'], name='dms_ecommer_territo_e210fc_idx'),
        ),
    ]
