"""
Give every organisation admin the "Organisation admin" grant (C72 step 2c).

For each membership whose standing is `admin`: an Administration grant
(`MembershipAppAccess`, app `admin`) holding the role `admin.org_admin`
(`permissions/0010`), placed at the organisation's root.

THE OWNER GETS NOTHING HERE. They hold Administration -- and everything else
-- by rule through `is_owner` (`organizations/0018`); a grant row would be a
second source that could disagree.

NOBODY GAINS OR LOSES ANYTHING YET. The admin standing still confers the same
14 permissions; the grant says the same thing a second way, and the readers
switch to it in commit 3 of this step. Dealer admins are untouched: their
standing is `member`, and they reach `admin.person.*` through the DMS System
administrator role.

IDEMPOTENT, because MySQL will not roll a half-run migration back (C39): a
membership that already has an Administration grant is left alone. And
DEFENSIVE ABOUT THE ROOT, like `0017`: no root means nowhere to place the
grant, so it refuses loudly rather than inventing a placement.

The reverse deletes every Administration grant -- nothing else writes one
before this migration exists.
"""

from django.db import migrations

ROLE_CODE = "admin.org_admin"


def grant(apps, schema_editor):
    Membership = apps.get_model("organizations", "Membership")
    Territory = apps.get_model("organizations", "Territory")
    MembershipAppAccess = apps.get_model("organizations", "MembershipAppAccess")
    MembershipAppRole = apps.get_model("organizations", "MembershipAppRole")
    MembershipAppTerritory = apps.get_model("organizations", "MembershipAppTerritory")
    Role = apps.get_model("permissions", "Role")

    role = Role.objects.get(app_id="admin", code=ROLE_CODE)
    roots = dict(Territory.objects.filter(is_root=True).values_list("organization_id", "id"))

    for membership in Membership.objects.filter(role="admin").order_by("created_at", "id"):
        if MembershipAppAccess.objects.filter(membership=membership, app_id="admin").exists():
            continue

        root_id = roots.get(membership.organization_id)
        if root_id is None:
            raise RuntimeError(
                f"Organisation {membership.organization_id} has no root territory; "
                "run organizations/0014 before granting Organisation admin."
            )

        access = MembershipAppAccess.objects.create(membership=membership, app_id="admin")
        MembershipAppRole.objects.create(app_access=access, role=role)
        MembershipAppTerritory.objects.create(app_access=access, territory_id=root_id)


def ungrant(apps, schema_editor):
    apps.get_model("organizations", "MembershipAppAccess").objects.filter(app_id="admin").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0018_membership_is_owner"),
        ("permissions", "0010_organisation_admin_role"),
    ]

    operations = [migrations.RunPython(grant, ungrant)]
