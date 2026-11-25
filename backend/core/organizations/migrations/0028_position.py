"""
DMS's REPORTING CHART, step 1 (C72 / C77 amended, the owner 2026-11-25): the
`Position` tree -- one per organisation per app, the organisation at its top --
and where a person's position is kept: `MembershipAppAccess.position` and, for an
invited person, `InvitationAppGrant.position`. Both nullable here; DMS requires
one through the services (step 2).

NO DATA: no position exists yet, and each chart's top is made on first use
(`Position.objects.root_for()`). Control plane: a plain `migrate`.
"""


import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0027_unplace_dms_root'),
        ('permissions', '0027_dms_position'),
    ]

    operations = [
        migrations.CreateModel(
            name='Position',
            fields=[
                ('path', models.CharField(max_length=255, unique=True)),
                ('depth', models.PositiveIntegerField()),
                ('numchild', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by_user_id', models.UUIDField(blank=True, editable=False, null=True)),
                ('updated_by_user_id', models.UUIDField(blank=True, editable=False, null=True)),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('share_with_peers', models.BooleanField(default=False, help_text="People in this position see each other's records (the owner, 2026-11-25).")),
                ('is_root', models.BooleanField(blank=True, editable=False, help_text="True for the chart's top (the organisation), NULL otherwise. Never set by hand.", null=True)),
                ('app', models.ForeignKey(db_column='app', help_text='Whose chart this is: every app that uses one has its own.', on_delete=django.db.models.deletion.PROTECT, related_name='+', to='permissions.app', to_field='code')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='positions', to='organizations.organization')),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='invitationappgrant',
            name='position',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='organizations.position'),
        ),
        migrations.AddField(
            model_name='membershipappaccess',
            name='position',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='holders', to='organizations.position'),
        ),
        migrations.AddConstraint(
            model_name='position',
            constraint=models.UniqueConstraint(fields=('organization', 'app', 'is_root'), name='position_one_root_per_org_app'),
        ),
        migrations.AddConstraint(
            model_name='position',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('depth', 1), ('is_root', True), ('is_root__isnull', False)), models.Q(('depth__gte', 2), ('is_root__isnull', True)), _connector='OR'), name='position_root_is_the_top'),
        ),
        migrations.AddConstraint(
            model_name='position',
            constraint=models.UniqueConstraint(fields=('organization', 'app', 'name'), name='position_unique_org_app_name'),
        ),
    ]
