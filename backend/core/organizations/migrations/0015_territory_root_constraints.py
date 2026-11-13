"""
The organisation becomes the root of its territory tree, step 3 of 3: the
database enforces it.

- `territory_one_root_per_org`: at most one root per organisation (a unique
  index over a True/NULL marker -- MySQL has no partial index, C39).
- `territory_root_is_the_organisation`: the root is kind `organisation` at
  depth 1, and every other territory is not, and sits at depth 2 or below.

Only after `0014`, which made the data satisfy both. If either is refused here,
`0014` did not finish: re-run it, it is idempotent.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0014_territory_organisation_roots"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(
                fields=("organization", "is_root"), name="territory_one_root_per_org"
            ),
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(depth=1, is_root=True, kind="organisation"),
                    models.Q(
                        models.Q(("kind", "organisation"), _negated=True),
                        depth__gte=2,
                        is_root__isnull=True,
                    ),
                    _connector="OR",
                ),
                name="territory_root_is_the_organisation",
            ),
        ),
    ]
