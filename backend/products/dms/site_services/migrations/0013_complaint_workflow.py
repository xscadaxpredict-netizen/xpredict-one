# Complaints get the visit rules (C-local-5): a real assigned person, who
# assigned them and when, and how the complaint was resolved and by whom.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("dms_site_services", "0012_visit_workflow"),
    ]

    operations = [
        migrations.AddField("complaint", "assigned_by_user_id", models.UUIDField(blank=True, null=True)),
        migrations.AddField("complaint", "assigned_at", models.DateTimeField(blank=True, null=True)),
        migrations.AddField("complaint", "resolved_by_user_id", models.UUIDField(blank=True, null=True)),
        migrations.AddField("complaint", "resolution_notes", models.TextField(blank=True, default="")),
        migrations.AddIndex(
            "complaint",
            models.Index(fields=["unit_id", "assigned_service_person_user_id"], name="complaint_unit_assignee"),
        ),
    ]
