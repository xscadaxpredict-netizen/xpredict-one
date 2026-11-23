# Every organisation gets its own working unit, the head office (C-local-4).

from django.db import migrations, models


def create_head_offices(apps, schema_editor):
    """One head office per existing organisation, named after it. Idempotent."""
    Organization = apps.get_model("organizations", "Organization")
    BusinessUnit = apps.get_model("organizations", "BusinessUnit")
    db = schema_editor.connection.alias
    for org in Organization.objects.using(db).all():
        units = BusinessUnit.objects.using(db).filter(organization=org)
        if units.filter(is_head_office=True).exists():
            continue
        name = org.name.strip()[:200]
        if units.filter(name=name).exists():
            name = f"{name[:186]} (Head office)"
        BusinessUnit.objects.using(db).create(
            organization=org, name=name, code=None, is_head_office=True
        )


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0007_businessunit_gstin_businessunit_pan"),
    ]

    operations = [
        migrations.AddField(
            model_name="businessunit",
            name="is_head_office",
            field=models.BooleanField(blank=True, editable=False, null=True),
        ),
        migrations.AddConstraint(
            model_name="businessunit",
            constraint=models.UniqueConstraint(
                fields=("organization", "is_head_office"), name="unit_one_head_office"
            ),
        ),
        migrations.RunPython(create_head_offices, migrations.RunPython.noop),
    ]
