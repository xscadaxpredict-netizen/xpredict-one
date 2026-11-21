# The visit workflow: who is assigned, when it started / completed / was
# cancelled, and exactly one service report per visit. `zone` is dropped --
# removed from every screen on 2026-11-18.

from django.db import migrations, models
import django.db.models.deletion


def one_report_per_visit(apps, schema_editor):
    """
    Before the link becomes unique: if a visit somehow has several reports,
    keep the earliest on it and unlink the rest (they stay as site reports).
    The form never sent a visit, so this is expected to find nothing.
    """
    from config.routers import current_tenant_db

    db = schema_editor.connection.alias
    token = current_tenant_db.set(db)
    try:
        ServiceReport = apps.get_model("dms_site_services", "ServiceReport")
        seen = set()
        for report in (
            ServiceReport._base_manager.using(db)
            .exclude(schedule_id=None)
            .order_by("schedule_id", "created_at")
        ):
            if report.schedule_id in seen:
                ServiceReport._base_manager.using(db).filter(pk=report.pk).update(schedule_id=None)
            else:
                seen.add(report.schedule_id)
    finally:
        current_tenant_db.reset(token)


class Migration(migrations.Migration):
    dependencies = [
        ("dms_site_services", "0011_alter_complaint_site_alter_servicereport_site_and_more"),
    ]

    operations = [
        migrations.AddField("serviceschedule", "assigned_by_user_id", models.UUIDField(blank=True, null=True)),
        migrations.AddField("serviceschedule", "assigned_at", models.DateTimeField(blank=True, null=True)),
        migrations.AddField("serviceschedule", "started_at", models.DateTimeField(blank=True, null=True)),
        migrations.AddField("serviceschedule", "completed_at", models.DateTimeField(blank=True, null=True)),
        migrations.AddField("serviceschedule", "cancelled_at", models.DateTimeField(blank=True, null=True)),
        migrations.AddField("serviceschedule", "cancel_reason", models.TextField(blank=True, default="")),
        migrations.AddIndex(
            "serviceschedule",
            models.Index(fields=["unit_id", "technician_user_id", "scheduled_date"], name="sched_unit_tech_date"),
        ),
        migrations.RunPython(one_report_per_visit, migrations.RunPython.noop),
        migrations.AlterField(
            "servicereport",
            "schedule",
            models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="service_report",
                to="dms_site_services.serviceschedule",
            ),
        ),
        migrations.RemoveField("servicereport", "zone"),
    ]
