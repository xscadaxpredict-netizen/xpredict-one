"""
Refuse to go on unless the grants hold everybody's access (C72 step 2d-3).

THE LAST LOOK BEFORE THE OLD COPY IS DROPPED. The next migration removes
`AppAccess`, `Membership.unit` and `Membership.role`. Anything not already
carried into the grants by `0017` (the copy) and `0019` (Organisation admin)
is lost with them -- a column dropped comes back empty if rolled back. So this
checks, on every control database it runs on, production included:

1. EVERY PERSON EXCEPT THE OWNER HOLDS AT LEAST ONE GRANT. C73 ("for now",
   the owner, 2026-11-11): somebody with none has no place in the territory
   tree, and the services have refused to make such a person since step 2d-1.
   The owner is exempt -- they hold everything by rule through `is_owner`.
2. EVERY GRANT HAS A ROLE AND AT LEAST ONE TERRITORY. The database can say
   "at most one role per grant"; it cannot say "at least one", so a grant
   half-written by hand would open nothing and look like access.

IT REFUSES, IT DOES NOT REPAIR (the owner's decision, 2026-11-12). There is no
app it could hand somebody for free (C73: apps are what the company sells),
and the only other repair is deleting the person. So the deploy stops and
names them, and a person decides each one -- give them an app, or remove
them -- and runs `migrate` again.

READ-ONLY, so running it twice, or after a refusal, is safe. The reverse does
nothing: there is nothing to undo.

It deliberately does NOT compare against `AppAccess`. Since step 2d-2 that
table is no longer written, so a person whose app was taken away afterwards
still has the stale row -- a mismatch that means nothing.
"""

from django.db import migrations


def _describe(membership) -> str:
    return f"{membership.user.email} ({membership.organization.slug})"


def check(apps, schema_editor):
    Membership = apps.get_model("organizations", "Membership")
    MembershipAppAccess = apps.get_model("organizations", "MembershipAppAccess")

    people = (
        Membership.objects.exclude(is_owner=True)
        .select_related("user", "organization")
        .order_by("organization__slug", "user__email")
    )
    held = set(MembershipAppAccess.objects.values_list("membership_id", flat=True))
    no_grant = [_describe(m) for m in people if m.pk not in held]

    broken = [
        f"{_describe(grant.membership)}: {grant.app_id}"
        for grant in MembershipAppAccess.objects.select_related(
            "membership__user", "membership__organization"
        ).order_by("membership__organization__slug", "membership__user__email", "app_id")
        if not grant.roles.exists() or not grant.territories.exists()
    ]

    if not no_grant and not broken:
        return

    lines = [
        "Cannot drop the old access tables: the grants do not hold everybody's access.",
        "Nothing has been changed. Fix each one below, then run migrate again.",
    ]
    if no_grant:
        lines.append("")
        lines.append("People with no app at all -- give each an app, or remove them:")
        lines.extend(f"  - {who}" for who in no_grant)
    if broken:
        lines.append("")
        lines.append("Grants missing a role or a territory -- re-save the person:")
        lines.extend(f"  - {which}" for which in broken)
    raise RuntimeError("\n".join(lines))


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0019_grant_organisation_admin"),
    ]

    operations = [migrations.RunPython(check, migrations.RunPython.noop)]
