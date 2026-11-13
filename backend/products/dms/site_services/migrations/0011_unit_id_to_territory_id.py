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
        ('dms_sales', '0005_unit_id_to_territory_id'),
        ('dms_site_services', '0010_servicereport_approval_remarks_and_more'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='complaint',
            name='dms_site_se_unit_id_fd54e3_idx',
        ),
        migrations.RemoveIndex(
            model_name='complaint',
            name='dms_site_se_unit_id_92c188_idx',
        ),
        migrations.RemoveIndex(
            model_name='complaint',
            name='dms_site_se_unit_id_bd135a_idx',
        ),
        migrations.RemoveIndex(
            model_name='reportattachment',
            name='dms_site_se_unit_id_8d64e9_idx',
        ),
        migrations.RemoveIndex(
            model_name='reportattachment',
            name='dms_site_se_unit_id_5b5066_idx',
        ),
        migrations.RemoveIndex(
            model_name='reportattachment',
            name='dms_site_se_unit_id_05f1ad_idx',
        ),
        migrations.RemoveIndex(
            model_name='servicereport',
            name='dms_site_se_unit_id_06ed95_idx',
        ),
        migrations.RemoveIndex(
            model_name='servicereport',
            name='dms_site_se_unit_id_c5c86b_idx',
        ),
        migrations.RemoveIndex(
            model_name='servicereport',
            name='dms_site_se_unit_id_9feee6_idx',
        ),
        migrations.RemoveIndex(
            model_name='serviceschedule',
            name='dms_site_se_unit_id_f54621_idx',
        ),
        migrations.RemoveIndex(
            model_name='serviceschedule',
            name='dms_site_se_unit_id_7584cd_idx',
        ),
        migrations.RemoveIndex(
            model_name='serviceschedule',
            name='dms_site_se_unit_id_ac7796_idx',
        ),
        migrations.RemoveIndex(
            model_name='siteserviceprofile',
            name='dms_site_se_unit_id_daf5b4_idx',
        ),
        migrations.RemoveIndex(
            model_name='waterreport',
            name='dms_site_se_unit_id_0f33d4_idx',
        ),
        migrations.RemoveIndex(
            model_name='waterreport',
            name='dms_site_se_unit_id_30fab4_idx',
        ),
        migrations.RenameField(
            model_name='complaint',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='reportattachment',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='servicereport',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='serviceschedule',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='siteserviceprofile',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='waterreport',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.AddIndex(
            model_name='complaint',
            index=models.Index(fields=['territory_id', 'status'], name='dms_site_se_territo_2312d0_idx'),
        ),
        migrations.AddIndex(
            model_name='complaint',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_site_se_territo_06ee85_idx'),
        ),
        migrations.AddIndex(
            model_name='complaint',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_site_se_territo_370eaf_idx'),
        ),
        migrations.AddIndex(
            model_name='reportattachment',
            index=models.Index(fields=['territory_id', 'service_report_id'], name='dms_site_se_territo_8c9e09_idx'),
        ),
        migrations.AddIndex(
            model_name='reportattachment',
            index=models.Index(fields=['territory_id', 'water_report_id'], name='dms_site_se_territo_dc2fbc_idx'),
        ),
        migrations.AddIndex(
            model_name='reportattachment',
            index=models.Index(fields=['territory_id', 'complaint_id'], name='dms_site_se_territo_b0721d_idx'),
        ),
        migrations.AddIndex(
            model_name='servicereport',
            index=models.Index(fields=['territory_id', 'status'], name='dms_site_se_territo_d995e0_idx'),
        ),
        migrations.AddIndex(
            model_name='servicereport',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_site_se_territo_876706_idx'),
        ),
        migrations.AddIndex(
            model_name='servicereport',
            index=models.Index(fields=['territory_id', '-service_date'], name='dms_site_se_territo_5cbc61_idx'),
        ),
        migrations.AddIndex(
            model_name='serviceschedule',
            index=models.Index(fields=['territory_id', 'status'], name='dms_site_se_territo_563169_idx'),
        ),
        migrations.AddIndex(
            model_name='serviceschedule',
            index=models.Index(fields=['territory_id', 'scheduled_date'], name='dms_site_se_territo_7e13e0_idx'),
        ),
        migrations.AddIndex(
            model_name='serviceschedule',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_site_se_territo_c3f9a3_idx'),
        ),
        migrations.AddIndex(
            model_name='siteserviceprofile',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_site_se_territo_4bbed8_idx'),
        ),
        migrations.AddIndex(
            model_name='waterreport',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_site_se_territo_c4113b_idx'),
        ),
        migrations.AddIndex(
            model_name='waterreport',
            index=models.Index(fields=['territory_id', '-date_tested'], name='dms_site_se_territo_29ca61_idx'),
        ),
    ]
