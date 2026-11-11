"""
C72 step 2c: `Membership.owner_marker` becomes `Membership.is_owner`.

Same column, same values (True for the owner, NULL for everybody else), same
one-owner unique index -- only the name changes, because from this step on the
code ASKS it ("is this the owner?") rather than merely using it to keep the
index honest.

WHY BOTH CONSTRAINTS ARE DROPPED AND ADDED BACK rather than renamed along
with the column:

- MySQL 8 refuses to rename a column that a CHECK constraint names (error
  3959, "Check constraint ... uses column ..."), so the check must go first.
- `RenameField` does not rewrite the column list of a `UniqueConstraint` in
  Django's migration state, so `makemigrations` would otherwise want a second
  migration rebuilding the one-owner index anyway. Doing it here keeps the
  rename in one place.

The organisation has no second owner at any moment of this: the rows do not
change, and the index comes back over exactly the values it guarded.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0017_copy_grants_into_per_app_grants"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="membership",
            name="membership_owner_marker_matches_role",
        ),
        migrations.RemoveConstraint(
            model_name="membership",
            name="membership_one_owner_per_org",
        ),
        migrations.RenameField(
            model_name="membership",
            old_name="owner_marker",
            new_name="is_owner",
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.UniqueConstraint(
                fields=("organization", "is_owner"), name="membership_one_owner_per_org"
            ),
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("is_owner", True), ("role", "owner")),
                    models.Q(
                        models.Q(("role", "owner"), _negated=True),
                        ("is_owner__isnull", True),
                    ),
                    _connector="OR",
                ),
                name="membership_is_owner_matches_role",
            ),
        ),
    ]
