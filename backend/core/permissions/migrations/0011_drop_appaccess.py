"""
Drop `AppAccess` (C72 step 2d-3).

Every person's apps and roles live in the per-app grants
(`organizations.MembershipAppAccess` -> `MembershipAppRole` +
`MembershipAppTerritory`). Nothing has read this table since step 2b, nor
written it since 2d-2.

AFTER `organizations/0020`, AND THAT DEPENDENCY IS LOAD-BEARING. `0017` copies
this table into the grants and `0020` refuses to go on unless the grants hold
everybody. Without the dependency Django may order this migration before
either on a database built from scratch, and `0017` would find no table to
copy from -- or the check would run after the data it guards was gone.

THE DATA DOES NOT COME BACK. Reversing recreates an empty table.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("permissions", "0010_organisation_admin_role"),
        ("organizations", "0020_check_every_person_has_a_grant"),
    ]

    operations = [
        migrations.DeleteModel(
            name="AppAccess",
        ),
    ]
