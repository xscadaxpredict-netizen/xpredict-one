"""
Drop `Membership.role` and `Membership.unit` (C72 step 2d-3).

Where a person sits and whether they administer are their grants now. Nothing
has read these two columns since steps 2c and 2d-1, nor written them since
2d-2 (the owner's `role` excepted, until this migration).

AFTER `0020`, which refuses to go on unless the grants hold everybody.

TWO CHECK CONSTRAINTS GO WITH THE COLUMNS, and one small one replaces them:

- `membership_is_owner_matches_role` -- nothing left to match.
- `membership_org_standing_has_no_unit` -- "an owner or admin is never placed
  at one dealership" is `_assert_organisation_wide()` in the services since
  step 2d-2: a 409 at invite, edit and accept, rather than a 500 at accept.
- `membership_is_owner_true_or_null` IS NEW, and keeps a guarantee the first
  one gave for free: `is_owner` is never False. A False would clash with the
  one-owner unique index on (organization, is_owner) the second time it
  appeared in an organisation, because only NULLs are distinct there.

THE DATA DOES NOT COME BACK. Reversing re-adds the columns -- `role` at its
default, `unit` empty -- not what they held. One thing IS restored, because the
reverse cannot finish without it: the owner's `role = "owner"`, set from
`is_owner` before `membership_is_owner_matches_role` is put back. Without that
step the re-added check refuses the owner's row (now "member") and the
rollback stops half done.
"""

from django.conf import settings
from django.db import migrations, models


def restore_owner_role(apps, schema_editor):
    """Reverse only: the re-added `role` must say "owner" where `is_owner` does."""
    apps.get_model("organizations", "Membership").objects.filter(is_owner=True).update(
        role="owner"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0020_check_every_person_has_a_grant"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="membership",
            name="membership_org_standing_has_no_unit",
        ),
        migrations.RemoveConstraint(
            model_name="membership",
            name="membership_is_owner_matches_role",
        ),
        # Nothing forwards. Backwards it runs AFTER `role` is re-added and
        # BEFORE the check above is restored -- operations reverse in order.
        migrations.RunPython(migrations.RunPython.noop, restore_owner_role),
        migrations.RemoveField(
            model_name="membership",
            name="role",
        ),
        migrations.RemoveField(
            model_name="membership",
            name="unit",
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.CheckConstraint(
                condition=models.Q(("is_owner", True), ("is_owner__isnull", True), _connector="OR"),
                name="membership_is_owner_true_or_null",
            ),
        ),
    ]
