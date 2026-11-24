"""
NO TERRITORY UNTIL ONE IS ASSIGNED (the owner, 2026-11-24; C82 amended).

Until today, joining DMS placed everybody at the TOP of DMS's tree (the
organisation), automatically -- so everybody saw every record. The owner: "every
user who joined the DMS app without any territory will not have any territory;
everything is possible only when a territory is assigned", and chose to unplace
the people the old rule put there ("unplace them").

So every DMS placement AT DMS'S ROOT is removed -- except the owner's, who is
everywhere by rule and is never shown as placed. Their DMS grant and role stay;
they see no DMS records until somebody assigns them a territory (Territory
Management -> People, or DMS Users -> Edit). Nobody could have chosen the root
by hand before today: no screen placed anyone.

REVERSE puts every DMS grant that has no place back at the root -- the old
rule, which is the best that can be restored.

Control plane: a plain `migrate`. No tenant data is touched.
"""

from django.db import migrations


def unplace(apps, schema_editor):
    MembershipAppTerritory = apps.get_model("organizations", "MembershipAppTerritory")
    MembershipAppTerritory.objects.filter(
        app_access__app_id="dms",
        territory__is_root=True,
        territory__app_id="dms",
    ).exclude(app_access__membership__is_owner=True).delete()


def replace_at_root(apps, schema_editor):
    MembershipAppAccess = apps.get_model("organizations", "MembershipAppAccess")
    MembershipAppTerritory = apps.get_model("organizations", "MembershipAppTerritory")
    Territory = apps.get_model("organizations", "Territory")
    for grant in MembershipAppAccess.objects.filter(app_id="dms", territories__isnull=True):
        root = Territory.objects.filter(
            organization_id=grant.membership.organization_id, app_id="dms", is_root=True
        ).first()
        if root is not None:
            MembershipAppTerritory.objects.create(app_access=grant, territory=root)


class Migration(migrations.Migration):
    dependencies = [("organizations", "0026_territory_app_required")]

    operations = [migrations.RunPython(unplace, replace_at_root)]
