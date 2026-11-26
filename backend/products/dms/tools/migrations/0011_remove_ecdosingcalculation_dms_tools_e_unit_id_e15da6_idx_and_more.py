"""
C72 piece 3 step 1: `unit_id` -> `territory_id` on the tools records.

RENUMBERED 0010 -> 0011 IN THE MERGE OF 2026-11-26: `main`'s
`0010_remove_timer_calculation` (already in production) deletes TimerCalculation,
so this runs after it, and its four TimerCalculation operations were taken out.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dms_sales', '0016_remove_confirmedsite_uq_site_unit_oc_number_and_more'),
        ('dms_tools', '0010_remove_timer_calculation'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='ecdosingcalculation',
            name='dms_tools_e_unit_id_e15da6_idx',
        ),
        migrations.RemoveIndex(
            model_name='ecdosingcalculation',
            name='dms_tools_e_unit_id_cfc2ab_idx',
        ),
        migrations.RenameField(
            model_name='ecdosingcalculation',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.RenameField(
            model_name='feasibilityreport',
            old_name='unit_id',
            new_name='territory_id',
        ),
        migrations.AddIndex(
            model_name='ecdosingcalculation',
            index=models.Index(fields=['territory_id', '-created_at'], name='dms_tools_e_territo_40706f_idx'),
        ),
        migrations.AddIndex(
            model_name='ecdosingcalculation',
            index=models.Index(fields=['territory_id', 'site_id'], name='dms_tools_e_territo_349e6d_idx'),
        ),
    ]
