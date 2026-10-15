"""
Seven codes for the DMS endpoints that had none, and their grants (C44).

WHY THIS MIGRATION EXISTS AT ALL. Thirteen DMS views inherited
`TenantAPIView`, which set `required_permissions = []` as a class default --
so none of them ever declared what they needed, and the platform's
"nobody has answered yet is a 500" rule (OrgScopedAPIView) could not fire.
Nine of the thirteen write. Any member of the organisation could delete a
user manual, remove a marketing asset, cancel a store order or rewrite the
capacity calculator's constants.

The code fix is one deleted line plus thirteen declarations. It needs these
rows to exist first, because C44 made permissions DATA: there was no
`dms.manual.manage` to declare.

IT DOES NOT IMPORT `catalogue.py`, which 0002 does and apologises for in its
own docstring. A migration is frozen history, and importing a module that
keeps changing means re-running this applies whatever the catalogue says
later rather than what this migration described. Seven codes are short enough
to write out, so they are written out; `catalogue.py` is updated in the same
commit and the two agree today.

IDEMPOTENT AND REVERSIBLE, for 0002's reasons: MySQL cannot roll a failed
migration back (C39), so "run it again" has to be safe, and a migration that
cannot be undone pins every environment the moment anything goes wrong.
"""

from __future__ import annotations

from django.db import migrations

# (code, app, module, group, label)
NEW_PERMISSIONS: list[tuple[str, str, str, str, str]] = [
    ("dms.manual.manage", "dms", "tech-support", "Library", "Add or remove user manuals"),
    ("dms.video.manage", "dms", "tech-support", "Library", "Add or remove machine videos"),
    (
        "dms.marketing_asset.manage",
        "dms",
        "tools",
        "Marketing",
        "Add or remove marketing material",
    ),
    (
        "dms.calculator.manage",
        "dms",
        "tools",
        "Calculator",
        "Change the capacity calculator's constants",
    ),
    ("dms.timer_calculation.delete", "dms", "tools", "Calculator", "Remove a saved calculation"),
    ("dms.store_order.create", "dms", "ecommerce", "Store orders", "Place a store order"),
    (
        "dms.store_order.manage",
        "dms",
        "ecommerce",
        "Store orders",
        "Cancel a store order, or move it along",
    ),
]

# THE SPLIT IS BY THE SCOPE OF THE DATA, not by seniority.
#
# Store orders and saved calculations inherit `UnitScopedModel`, so they
# belong to one dealership and `allowed_units` confines them -- a dealership's
# Manager is the right audience.
#
# Manuals, videos, marketing material and the calculator constants inherit
# `BaseModel`. They have no `unit_id`, so nothing confines them: there is one
# copy per organisation and every dealership reads it. A unit-level grant
# would let a Manager at one dealership change what every other dealership
# sees, which is the reach C5 and C40 exist to prevent, so those four are
# granted at organisation level only.
UNIT_LEVEL = [
    "dms.store_order.create",
    "dms.store_order.manage",
    "dms.timer_calculation.delete",
]
ORG_LEVEL = [
    "dms.manual.manage",
    "dms.video.manage",
    "dms.marketing_asset.manage",
    "dms.calculator.manage",
]

GRANTS: dict[str, list[str]] = {
    "dms.manager": UNIT_LEVEL,
    "dms.group_operations": [*UNIT_LEVEL, *ORG_LEVEL],
}

# NOT GRANTED TO `dms.system_admin`, DELIBERATELY, and this is the line most
# likely to need revisiting. That role "runs the SOFTWARE" at one dealership
# (C36), which makes it the intuitive home for a content library -- but it is
# a UNIT-level role, and the four library resources are organisation-wide.
# Granting them there would reintroduce the cross-dealership reach this
# migration closes. If a dealer admin genuinely needs to upload a manual, the
# answer is another migration adding it on purpose.


def grant(apps, schema_editor):
    Permission = apps.get_model("permissions", "Permission")
    Role = apps.get_model("permissions", "Role")
    RolePermission = apps.get_model("permissions", "RolePermission")

    permissions = {}
    for code, app, module, group, label in NEW_PERMISSIONS:
        permission, _ = Permission.objects.update_or_create(
            code=code,
            defaults={"app": app, "module": module, "group": group, "label": label},
        )
        permissions[code] = permission

    for role_code, granted in GRANTS.items():
        # A role the catalogue has not seeded yet is skipped rather than
        # created: 0002 owns the nine built-in roles, and inventing a tenth
        # here would leave a nameless row nobody can explain.
        role = Role.objects.filter(code=role_code).first()
        if role is None:
            continue

        held = {link.permission_id for link in RolePermission.objects.filter(role=role)}
        for code in granted:
            if permissions[code].id not in held:
                RolePermission.objects.create(role=role, permission=permissions[code])


def withdraw(apps, schema_editor):
    """
    Remove these seven codes and every grant of them.

    Scoped to this migration's own codes. The `RolePermission` rows go with
    the `Permission` rows through the FK cascade, but they are deleted
    explicitly first so the intent is readable rather than implied.
    """
    Permission = apps.get_model("permissions", "Permission")
    RolePermission = apps.get_model("permissions", "RolePermission")

    codes = [code for code, *_rest in NEW_PERMISSIONS]
    RolePermission.objects.filter(permission__code__in=codes).delete()
    Permission.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0003_role_display_order")]

    operations = [migrations.RunPython(grant, withdraw)]
