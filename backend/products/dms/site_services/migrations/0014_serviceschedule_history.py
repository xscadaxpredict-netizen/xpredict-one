# A cancelled visit is rescheduled in place; its cancellation stays in `history`.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("dms_site_services", "0013_complaint_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="serviceschedule",
            name="history",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
