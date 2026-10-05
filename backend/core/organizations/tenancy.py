"""
Creating a tenant database, and teaching Django how to reach one.

Database-per-tenant (C1) means connections are not all declared in settings:
one exists per organization and they are registered at runtime, from the
`Organization` row (C46). Both the provisioning task and the tenant middleware
need that, so it lives here rather than in either of them.

NOTHING HERE IMPORTS `config`. `config.urls` already imports from `core`, so a
`core` -> `config` import would close a package cycle. The contextvar that
carries the current tenant lives in `config.routers` and is set by the
middleware, which is in `config` for the same reason -- it is a sibling of the
router, not of the models.
"""

from __future__ import annotations

import copy
import re

from django.conf import settings
from django.db import connections

from core.organizations.models import Organization

# The alias IS the database name. Both are unique, both are derived from the
# slug, and having one name for the thing makes a stack trace legible: an error
# mentioning `xpredict_acme_motors` says which tenant without a lookup.
#
# THE PATTERN IS A SECURITY CONTROL, not a sanity check. A database name cannot
# be a bound parameter -- `CREATE DATABASE %s` is not valid SQL -- so it has to
# be interpolated, and anything interpolated into SQL must be proved safe
# first. `_derive_db_name()` builds it from a slug, so it should already be
# harmless; this is the belt to that braces, placed at the point of use where
# it cannot be bypassed by a future caller who builds a name some other way.
#
# 55 characters after the prefix keeps the whole name inside MySQL's 64-character
# identifier cap (C46).
_SAFE_DB_NAME = re.compile(r"^xpredict_[a-z0-9_]{1,55}$")


class UnsafeTenantDatabaseNameError(RuntimeError):
    """
    A database name that will not be interpolated into SQL.

    Deliberately NOT a `DomainError`. This is never a user's fault and must
    never become a 4xx: it means something built a database name outside
    `_derive_db_name()`, which is a bug, and softening it into a validation
    error would hide an injection attempt as a form hint.
    """


def assert_safe_db_name(db_name: str) -> None:
    if not _SAFE_DB_NAME.fullmatch(db_name):
        raise UnsafeTenantDatabaseNameError(
            f"Refusing to use {db_name!r} as a database name: it does not match "
            "the tenant pattern, and a database name cannot be parameterised."
        )


def tenant_alias(organization: Organization) -> str:
    """The `connections` alias for this organization. Same as its database name."""
    assert_safe_db_name(organization.db_name)
    return organization.db_name


def register_tenant_connection(organization: Organization) -> str:
    """
    Make `connections[alias]` usable for this organization, and return the alias.

    Idempotent, and called on EVERY request that resolves a tenant --- Django
    workers are long-lived, so the second request for an organization finds the
    entry already there. Re-registering would be harmless but pointless.

    The settings are copied from `default` and then overridden from the ROW,
    which is C46 doing its job: the row is the only source of a tenant host, so
    moving one organization to another MySQL server is an UPDATE rather than a
    deploy. Everything else --- engine, user, password, charset, timeouts ---
    comes from `default`, because those are properties of how this application
    talks to MySQL rather than of any one tenant.
    """
    alias = tenant_alias(organization)

    if alias not in connections.databases:
        # deepcopy, not dict(): OPTIONS is a nested dict, and a shallow copy
        # would have every tenant sharing one OPTIONS object with `default`.
        # Mutating it later would then change every connection at once.
        config = copy.deepcopy(settings.DATABASES["default"])
        config["NAME"] = organization.db_name
        config["HOST"] = organization.db_host
        config["PORT"] = organization.db_port
        connections.databases[alias] = config

    return alias


def create_tenant_database(organization: Organization) -> None:
    """
    `CREATE DATABASE` for this organization, on the control connection.

    IF NOT EXISTS because provisioning must be safe to run twice. A task that
    only works on a clean slate cannot be retried, and this one runs after a
    web request has already committed --- so "run it again" is the only
    recovery available.

    The charset and collation match `create_dev_db.sql` rather than relying on
    the server default: utf8mb4 is real four-byte UTF-8, and MySQL's "utf8" is
    a three-byte subset that silently truncates anything outside the BMP. A
    tenant database created with the wrong default would be discovered by an
    emoji in a customer's name, months later.
    """
    assert_safe_db_name(organization.db_name)

    with connections["default"].cursor() as cursor:
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS `{organization.db_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
        )


def drop_tenant_database(organization: Organization) -> None:
    """
    `DROP DATABASE` for this organization. **Takes every record with it.**

    Here for tests and for a provisioning failure that has to be unwound by
    hand. Nothing in the product calls it, and nothing should: closing a
    dealership is a status change (Q21) and there is no decision anywhere that
    deleting an organization is allowed at all.
    """
    assert_safe_db_name(organization.db_name)

    with connections["default"].cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS `{organization.db_name}`")
