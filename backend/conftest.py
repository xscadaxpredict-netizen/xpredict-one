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
        "MIGRATE": True,
        "MIRROR": None,
        "DEPENDENCIES": [],
    }
    settings.DATABASES[TEST_TENANT_ALIAS] = config


# At import rather than in `pytest_configure`: this module is imported during
# collection, after pytest-django has configured settings and before any test
# class is constructed, which is the window the allowlist is built in.
_declare_test_tenant_database()
