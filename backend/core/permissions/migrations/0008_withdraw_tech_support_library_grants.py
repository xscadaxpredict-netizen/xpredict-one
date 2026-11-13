"""
Take the organisation library back off the dealership Tech support role (C67).

WHERE THE TWO GRANTS CAME FROM. Until 2026-11-05 `0002` imported the live
`catalogue.py`, whose `_TICKETS` gathered the whole `tech-support` module --
and after `c87b376` that module also held `dms.manual.manage` and
`dms.video.manage`. So every control database built FROM SCRATCH after
2026-10-15 gave Tech support, a unit-level role, the power to change manuals
and videos that every dealership reads. That is the cross-dealership reach C67
and `0004` exist to prevent.

`0002` reads a frozen copy now, so no new database gets them. This removes them
from the databases that already did: developer machines and anything else
rebuilt in that window. ON PRODUCTION IT DOES NOTHING -- production ran `0002`
on 2026-10-03, before those codes existed, and never held these rows.

WRITTEN OUT, NOT IMPORTED, like `0004`: a migration that reads a module which
keeps changing is how this happened (`tests/test_migration_history.py`).

IDEMPOTENT: deleting rows that are not there deletes nothing, so re-running is
safe -- which MySQL's lack of DDL rollback makes a requirement (C39).

THE REVERSE IS A DELIBERATE NO-OP. Reversing would mean putting the grants
back, re-opening the leak on a database that never had it. Unapplying this
leaves the data alone, which is the one state that was always correct.
"""

from __future__ import annotations

from django.db import migrations

ROLE = "dms.tech_support"
WITHDRAWN = ["dms.manual.manage", "dms.video.manage"]


def withdraw(apps, schema_editor):
    RolePermission = apps.get_model("permissions", "RolePermission")

    RolePermission.objects.filter(role__code=ROLE, permission__code__in=WITHDRAWN).delete()


class Migration(migrations.Migration):
    dependencies = [("permissions", "0007_app_foreign_key")]

    operations = [migrations.RunPython(withdraw, migrations.RunPython.noop)]
