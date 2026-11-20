"""
Organisations' own roles (C72 piece 5, the role builder; the owner, 2026-11-20).

1. `Role.organization_id`: NULL for a built-in role, the owning organisation
   for one made in Admins and Roles -> Roles -> Add Role. A plain UUID, not a
   key: `organizations` already depends on this app.
2. `Role.summary` up to 500 characters -- the builder's Description.
3. One name per organisation per app (built-ins, NULL here, are unaffected).

Schema only, no data. Control plane: a plain `migrate`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('permissions', '0019_user_edit_app'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='organization_id',
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name='role',
            name='summary',
            field=models.CharField(max_length=500),
        ),
        migrations.AddConstraint(
            model_name='role',
            constraint=models.UniqueConstraint(fields=('organization_id', 'app', 'name'), name='role_unique_org_app_name'),
        ),
    ]
