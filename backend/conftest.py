"""
Test configuration shared by the whole suite.

ONE PRE-DECLARED TENANT DATABASE, and it exists because Django's test isolation
and database-per-tenant (C1) are in direct conflict.

In production a tenant connection is registered at runtime, from the
`Organization` row (C46) --- `settings.DATABASES` never names it. Django's test
guards refuse exactly that: `SimpleTestCase` patches connection creation and
raises `DatabaseOperationForbidden` for any alias not in the test's `databases`
set, which is computed once at setup. `databases="__all__"` does not help, since
that resolves to the aliases present at setup too. A runtime alias therefore
cannot be reached from a test at all.

So the suite declares one, here, before any test class is built. Provisioning
tests point an organization's `db_name` at it and then do the real thing:
`CREATE DATABASE`, `migrate`, and read the tables back. The only realism given
up is that the name is fixed instead of derived per tenant --- and
`test_tenancy.py` covers the derivation separately, where no connection is
needed.

`TEST.NAME` is set explicitly so Django does not prefix it with `test_`. Both
names have to match: our code creates the database from `Organization.db_name`
while Django connects through the alias, and if those disagree the test creates
one database and queries another. The name still matches the `xpredict\\_%`
grant pattern, or MySQL would refuse to create it.
"""

from __future__ import annotations

import copy

from django.conf import settings

TEST_TENANT_ALIAS = "xpredict_test_tenant"


def _declare_test_tenant_database() -> None:
    if TEST_TENANT_ALIAS in settings.DATABASES:
        return

    config = copy.deepcopy(settings.DATABASES["default"])
    config["NAME"] = TEST_TENANT_ALIAS
    # EVERY KEY, not just NAME. Django fills these in itself for aliases that
    # come from settings, but it does so once, and an alias added here after
    # that has to arrive complete -- a partial dict fails later with
    # `KeyError: 'MIRROR'` from deep inside the test runner, which does not
    # look like a missing default.
    config["TEST"] = {
        "NAME": TEST_TENANT_ALIAS,
        "CHARSET": "utf8mb4",
        "COLLATION": "utf8mb4_0900_ai_ci",
        # MIGRATE FALSE, so the test runner creates this database and puts
        # NOTHING in it.
        #
        # `create_test_db` runs a BARE `migrate` on every declared alias at
        # session setup. On a tenant alias that walks every app, lets the
        # router veto each operation, and still records all 39 control-plane
        # migrations as applied — so the test tenant database arrived
        # pre-polluted with exactly the bookkeeping that
        # `tenant_migration_targets()` exists to prevent, and no change to the
        # product could stop it.
        #
        # It cost real time: a test asserting "no control-plane app is recorded
        # here" passed only because an earlier test happened to drop the
        # database first, and would have started failing — pointing at the
        # product — the moment any tenant app gained a migration.
        #
        # False is also the truthful setting. In production a tenant database
        # is created empty and `provision_tenant` is the only thing that ever
        # migrates it. Now the tests work the same way.
        "MIGRATE": False,
        "MIRROR": None,
        "DEPENDENCIES": [],
    }
    settings.DATABASES[TEST_TENANT_ALIAS] = config


# At import rather than in `pytest_configure`: this module is imported during
# collection, after pytest-django has configured settings and before any test
# class is constructed, which is the window the allowlist is built in.
_declare_test_tenant_database()
