"""
Copy every existing grant into the per-app grant tables (C72 piece 2, step 2a).

For each `permissions.AppAccess` row -- "this membership may use this app, as
this role" -- write the same grant into `MembershipAppAccess` +
`MembershipAppRole`, and place it where today's data says the person sits:

- `Membership.unit` set   -> that one dealership;
- `Membership.unit` empty -> the organisation's root (organisation-wide).

Nobody gains or loses anything: the new tables say exactly what the old ones
say, and nothing reads them until step 2b. Administration is never an
`AppAccess` row (C44), so nothing is copied for it; it arrives with step 2c.

IDEMPOTENT, because MySQL will not roll a half-run migration back (C39): a
membership that already has the grant for an app is left alone, so a re-run
finishes the job instead of failing on the unique constraint.

DEFENSIVE ABOUT THE ROOT: `0014` gave every organisation one, and sign-up makes
one, but an organisation without a root here would mean a grant with nowhere to
sit -- so this refuses loudly rather than inventing a placement.

The reverse deletes what this created: the new tables are a copy, and the
originals are untouched until step 2d.
"""

from django.db import migrations


def copy(apps, schema_editor):
    AppAccess = apps.get_model("permissions", "AppAccess")
    Territory = apps.get_model("organizations", "Territory")
    MembershipAppAccess = apps.get_model("organizations", "MembershipAppAccess")
    MembershipAppRole = apps.get_model("organizations", "MembershipAppRole")
    MembershipAppTerritory = apps.get_model("organizations", "MembershipAppTerritory")

    roots = dict(Territory.objects.filter(is_root=True).values_list("organization_id", "id"))

    for old in AppAccess.objects.select_related("membership").order_by("created_at", "id"):
        membership = old.membership
        if MembershipAppAccess.objects.filter(membership=membership, app_id=old.app_id).exists():
            continue

        territory_id = membership.unit_id or roots.get(membership.organization_id)
        if territory_id is None:
            raise RuntimeError(
                f"Organisation {membership.organization_id} has no root territory; "
                "run organizations/0014 before copying grants."
            )

        grant = MembershipAppAccess.objects.create(
            membership=membership,
            app_id=old.app_id,
            created_by_user_id=old.created_by_user_id,
        )
        MembershipAppRole.objects.create(app_access=grant, role_id=old.role_id)
        MembershipAppTerritory.objects.create(app_access=grant, territory_id=territory_id)


def uncopy(apps, schema_editor):
    apps.get_model("organizations", "MembershipAppAccess").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0016_per_app_grants"),
        ("permissions", "0009_territory_permissions"),
    ]

    operations = [migrations.RunPython(copy, uncopy)]
