"""
An invitation is a person -- first name, last name, email -- and nothing else
(C83, the owner 2026-11-20). Drops `Invitation.role` and `Invitation.unit`.

THE ADMIN PANEL INVITES A PERSON, as Zoho's does: no standing, no place, no
apps. Apps are assigned afterwards; an APP's own invite (C72 piece 5) will carry
that app's role through `InvitationAppGrant`, which stays.

REFUSES FIRST, IT DOES NOT REPAIR -- the same rule as `0020`. A pending
invitation that would lose something by this change would let somebody join
with less than they were promised, and nothing would tell them. So the deploy
stops and names each one; a person cancels it (and invites again, then assigns)
and runs `migrate` again. On every control database, production included:

1. AN INVITATION TO BE AN ADMIN (`role = "admin"`). Being made an admin now
   happens once somebody has joined.
2. AN INVITATION NAMING A DEALERSHIP (`unit` set). Nobody is placed on joining
   any more.
3. AN INVITATION WHOSE APP ROLE IS A DEALERSHIP ROLE (`level = "unit"`). With no
   place on joining, its apps sit at the organisation's root, where only an
   organisation-level role is legal -- accepting it would be refused.

Accepted invitations are history and are not checked.

A CONTROL-PLANE MIGRATION: a plain `migrate`, not `migrate_all_tenants`.
Rolling back restores the two columns EMPTY (`role` back to its old default,
"member") -- the data is gone, which is why the check runs first.
"""

from django.db import migrations, models


def _describe(invitation) -> str:
    return f"{invitation.email} ({invitation.organization.slug})"


def check(apps, schema_editor):
    Invitation = apps.get_model("organizations", "Invitation")
    InvitationAppGrant = apps.get_model("organizations", "InvitationAppGrant")

    pending = Invitation.objects.filter(accepted_at__isnull=True).select_related("organization")
    as_admin = [_describe(i) for i in pending.filter(role="admin").order_by("email")]
    placed = [_describe(i) for i in pending.filter(unit__isnull=False).order_by("email")]
    dealer_roles = [
        f"{_describe(grant.invitation)}: {grant.app_id} {grant.role.code}"
        for grant in InvitationAppGrant.objects.filter(
            invitation__accepted_at__isnull=True, role__level="unit"
        )
        .select_related("invitation__organization", "role")
        .order_by("invitation__email", "app_id")
    ]

    if not (as_admin or placed or dealer_roles):
        return

    lines = [
        "Cannot drop Invitation.role and Invitation.unit: some pending invitations",
        "would lose part of what they promise. Nothing has been changed.",
        "Cancel each one below (invite again, then assign), then run migrate again.",
    ]
    if as_admin:
        lines += ["", "Invitations to be an admin:", *(f"  - {who}" for who in as_admin)]
    if placed:
        lines += ["", "Invitations naming a dealership:", *(f"  - {who}" for who in placed)]
    if dealer_roles:
        lines += ["", "Invitations with a dealership role:", *(f"  - {w}" for w in dealer_roles)]
    raise RuntimeError("\n".join(lines))


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0021_drop_membership_role_and_unit"),
        ("permissions", "0018_admin_panel_permissions"),
    ]

    operations = [
        migrations.RunPython(check, migrations.RunPython.noop),
        migrations.RemoveField(model_name="invitation", name="role"),
        migrations.RemoveField(model_name="invitation", name="unit"),
    ]
