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
        ('dms_sales', '0004_alter_followup_next_followup_date_and_more'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='confirmedsite',
            name='uq_site_unit_oc_number',
        ),
        migrations.RemoveConstraint(
            model_name='quotation',
            name='uq_quotation_unit_quote_no',
        ),
        migrations.RemoveIndex(
            model_name='bankaccount',
            name='dms_sales_b_unit_id_d8aa99_idx',
        ),
        migrations.RemoveIndex(
            model_name='confirmedsite',
            name='dms_sales_c_unit_id_cd994b_idx',
        ),
        migrations.RemoveIndex(
            model_name='confirmedsite',
            name='dms_sales_c_unit_id_5762eb_idx',
        ),
        migrations.RemoveIndex(
            model_name='customer',
            name='dms_sales_c_unit_id_8561c1_idx',
        ),
        migrations.RemoveIndex(
            model_name='customer',
            name='dms_sales_c_unit_id_d53e7f_idx',
        ),
        migrations.RemoveIndex(
            model_name='enquiry',
            name='dms_sales_e_unit_id_06b0c3_idx',
        ),
        migrations.RemoveIndex(
            model_name='enquiry',
            name='dms_sales_e_unit_id_5d3782_idx',
        ),
        migrations.RemoveIndex(
            model_name='followup',
            name='dms_sales_f_unit_id_20ada4_idx',
        ),
        migrations.RemoveIndex(
            model_name='productcatalog',
            name='dms_sales_p_unit_id_90d966_idx',
        ),
        migrations.RemoveIndex(
            model_name='productcatalog',
            name='dms_sales_p_unit_id_840256_idx',
        ),
        migrations.RemoveIndex(
            model_name='productspec',
            name='dms_sales_p_unit_id_475354_idx',
        ),
        migrations.RemoveIndex(
            model_name='quotation',
            name='dms_sales_q_unit_id_2e998d_idx',
        ),
        migrations.RemoveIndex(
            model_name='quotation',
            name='dms_sales_q_unit_id_415c78_idx',
        ),
        migrations.RemoveIndex(
            model_name='quotation',
            name='dms_sales_q_unit_id_4c421b_idx',
        ),
        migrations.RemoveIndex(
            model_name='quotationitem',
            name='dms_sales_q_unit_id_07413f_idx',
        ),
        migrations.RenameField(
            model_name='bankaccount',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='confirmedsite',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='customer',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='enquiry',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='followup',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='productcatalog',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='productspec',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='quotation',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='quotationitem',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.AddIndex(
            model_name='bankaccount',
            index=models.Index(fields=['territory_id', 'is_default'], name='dms_sales_b_territo_86b259_idx'),
        ),
        migrations.AddIndex(
            model_name='confirmedsite',
            index=models.Index(fields=['territory_id', 'is_active'], name='dms_sales_c_territo_57a836_idx'),
        ),
        migrations.AddIndex(
            model_name='confirmedsite',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_sales_c_territo_489b94_idx'),
        ),
        migrations.AddIndex(
            model_name='customer',
            index=models.Index(fields=['territory_id', 'name'], name='dms_sales_c_territo_611c50_idx'),
        ),
        migrations.AddIndex(
            model_name='customer',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_sales_c_territo_0dd442_idx'),
        ),
        migrations.AddIndex(
            model_name='enquiry',
            index=models.Index(fields=['territory_id', 'status'], name='dms_sales_e_territo_795157_idx'),
        ),
        migrations.AddIndex(
            model_name='enquiry',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_sales_e_territo_ba15f0_idx'),
        ),
        migrations.AddIndex(
            model_name='followup',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_sales_f_territo_447b39_idx'),
        ),
        migrations.AddIndex(
            model_name='productcatalog',
            index=models.Index(fields=['territory_id', 'product_type'], name='dms_sales_p_territo_2d00ef_idx'),
        ),
        migrations.AddIndex(
            model_name='productcatalog',
            index=models.Index(fields=['territory_id', 'is_active'], name='dms_sales_p_territo_8ada1a_idx'),
        ),
        migrations.AddIndex(
            model_name='productspec',
            index=models.Index(fields=['territory_id', 'product_id'], name='dms_sales_p_territo_97f9d9_idx'),
        ),
        migrations.AddIndex(
            model_name='quotation',
            index=models.Index(fields=['territory_id', 'status'], name='dms_sales_q_territo_7ad1d3_idx'),
        ),
        migrations.AddIndex(
            model_name='quotation',
            index=models.Index(fields=['territory_id', 'quote_type'], name='dms_sales_q_territo_a3efd7_idx'),
        ),
        migrations.AddIndex(
            model_name='quotation',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_sales_q_territo_8be51b_idx'),
        ),
        migrations.AddIndex(
            model_name='quotationitem',
            index=models.Index(fields=['territory_id', 'quotation_id'], name='dms_sales_q_territo_5b8255_idx'),
        ),
        migrations.AddConstraint(
            model_name='confirmedsite',
            constraint=models.UniqueConstraint(condition=models.Q(('oc_number', ''), _negated=True), fields=('territory_id', 'oc_number'), name='uq_site_unit_oc_number'),
        ),
        migrations.AddConstraint(
            model_name='quotation',
            constraint=models.UniqueConstraint(fields=('territory_id', 'quote_no'), name='uq_quotation_unit_quote_no'),
        ),
    ]
