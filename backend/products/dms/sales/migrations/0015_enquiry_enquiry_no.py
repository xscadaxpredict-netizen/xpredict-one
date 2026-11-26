"""
Give every enquiry its own number: ENQ/<financial year>/<running number>.

A customer can have several enquiries, and a name, a date or a remark can
repeat; the number cannot. New enquiries are numbered by
services._generate_enquiry_number. This numbers the ones that already exist,
per dealership and per financial year (April to March, India time), in the
order they were created --- the same rule, so the next new enquiry continues the
sequence.

The column is added empty, filled, then made unique per dealership. The unique
constraint has no condition because MySQL does not enforce conditional ones.
"""

import datetime
from zoneinfo import ZoneInfo

from django.db import migrations, models

_FY_ZONE = ZoneInfo("Asia/Kolkata")


def _fy_label(when: datetime.datetime) -> str:
    day = when.astimezone(_FY_ZONE).date()
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def number_existing(apps, schema_editor):
    db = schema_editor.connection.alias
    Enquiry = apps.get_model("dms_sales", "Enquiry")
    manager = Enquiry._base_manager.using(db)
    counters: dict[tuple, int] = {}
    for pk, unit_id, created_at in manager.order_by("created_at", "id").values_list(
        "id", "unit_id", "created_at"
    ):
        fy = _fy_label(created_at)
        key = (unit_id, fy)
        counters[key] = counters.get(key, 0) + 1
        manager.filter(pk=pk).update(enquiry_no=f"ENQ/{fy}/{counters[key]:04d}")


class Migration(migrations.Migration):
    dependencies = [
        ("dms_sales", "0014_backfill_amc_quote_site"),
    ]

    operations = [
        migrations.AddField(
            model_name="enquiry",
            name="enquiry_no",
            field=models.CharField(default="", editable=False, max_length=30),
            preserve_default=False,
        ),
        migrations.RunPython(number_existing, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="enquiry",
            constraint=models.UniqueConstraint(
                fields=("unit_id", "enquiry_no"), name="uq_enquiry_unit_enquiry_no"
            ),
        ),
    ]
