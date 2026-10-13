"""
GSTIN and PAN on a dealership.

CONTROL PLANE, so `allow_migrate` lets this run against `xpredict_control`
only and no tenant database gains the columns -- `BusinessUnit` lives in
`CONTROL_PLANE_APPS` because dealerships are structure, not business data.

THE FOUR EXISTING DEALERSHIPS GET "", not a placeholder. Both columns are NOT
NULL with an implicit empty-string default, which is why neither field is
`blank=False`: the API requires a GSTIN on every write from now on, but a row
written before this migration cannot retroactively have one, and a model that
claimed otherwise would be lying about what is stored. Editing one of those
dealerships will ask for its GSTIN, which is the right moment to ask.

REVERSIBLE, and losing data if reversed -- `RemoveField` drops the column.
That is the normal cost of an added column and worth stating, because the
seed migration next door (`permissions/0002`) goes to some trouble to be
reversible WITHOUT loss and somebody may assume the same of every migration
here.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0006_drop_membership_invited'),
    ]

    operations = [
        migrations.AddField(
            model_name='businessunit',
            name='gstin',
            field=models.CharField(blank=True, max_length=15),
        ),
        migrations.AddField(
            model_name='businessunit',
            name='pan',
            field=models.CharField(blank=True, max_length=10),
        ),
    ]
