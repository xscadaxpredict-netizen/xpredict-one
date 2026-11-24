"""
Every app has its own territory tree, step 2 of 3 (the owner, 2026-11-24).

1. EVERY EXISTING TERRITORY BECOMES DMS'S. Until today there was one tree per
   organisation and only DMS drew in it (regions, dealers, branches,
   warehouses), so the whole of it is DMS's tree, unchanged: same ids, same
   paths, so every grant, invitation and tenant record still points at it.

2. EVERY OTHER APP'S PEOPLE MOVE TO THAT APP'S OWN ROOT. The Admin panel's
   organisation-wide people (and CRM's, where there are any) were placed at the
   shared root. Each such app gets a root of its own in that organisation, and
   their placements move onto it. A placement of another app BELOW the root --
   which the rules never allowed (C27) -- moves to that app's root as well.

A NEW ROOT IS NUMBERED AFTER THE HIGHEST ROOT IN THE TABLE, as `0014` did, so
no path can collide while this runs. It has no children: `numchild` 0.

IDEMPOTENT, because MySQL does not roll a failed migration back (C39): a
re-run finds the roots it made and the placements it already moved.

THE PATH ENCODING IS WRITTEN OUT, as in `0011` and `0014`: a migration is
history (`tests/test_migration_history.py`). Base 36 over digits and capitals,
five characters per level.

The reverse moves every placement back to the organisation's DMS root and
deletes the other roots; `0024`'s reverse then drops the column.
"""

import uuid

from django.db import migrations
from django.db.models import F

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
STEPLEN = 5
DMS = "dms"


def _encode(position: int) -> str:
    digits = ""
    while position:
        position, remainder = divmod(position, len(ALPHABET))
        digits = ALPHABET[remainder] + digits
    return digits.rjust(STEPLEN, ALPHABET[0])


def _decode(step: str) -> int:
    value = 0
    for char in step:
        value = value * len(ALPHABET) + ALPHABET.index(char)
    return value


def _root_for(Territory, organization_id, app):
    root = Territory.objects.filter(
        organization_id=organization_id, app_id=app, is_root=True
    ).first()
    if root is not None:
        return root
    highest = max(
        (_decode(p) for p in Territory.objects.filter(depth=1).values_list("path", flat=True)),
        default=0,
    )
    return Territory.objects.create(
        id=uuid.uuid4(),
        organization_id=organization_id,
        app_id=app,
        kind="organisation",
        name="",
        is_root=True,
        path=_encode(highest + 1),
        depth=1,
        numchild=0,
    )


def give_every_app_its_tree(apps, schema_editor):
    Territory = apps.get_model("organizations", "Territory")
    MembershipAppTerritory = apps.get_model("organizations", "MembershipAppTerritory")

    Territory.objects.filter(app__isnull=True).update(app_id=DMS)

    # Every placement whose box is in another app's tree than its grant's.
    misplaced = MembershipAppTerritory.objects.exclude(
        territory__app_id=F("app_access__app_id")
    ).select_related("app_access__membership")
    for placement in misplaced:
        root = _root_for(
            Territory, placement.app_access.membership.organization_id, placement.app_access.app_id
        )
        placement.territory_id = root.id
        placement.save(update_fields=["territory"])


def back_to_one_tree(apps, schema_editor):
    Territory = apps.get_model("organizations", "Territory")
    MembershipAppTerritory = apps.get_model("organizations", "MembershipAppTerritory")

    for root in Territory.objects.filter(is_root=True).exclude(app_id=DMS):
        dms_root = _root_for(Territory, root.organization_id, DMS)
        MembershipAppTerritory.objects.filter(territory=root).update(territory=dms_root)
        root.delete()


class Migration(migrations.Migration):
    dependencies = [("organizations", "0024_territory_app")]

    operations = [migrations.RunPython(give_every_app_its_tree, back_to_one_tree)]
