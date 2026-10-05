"""
Tenant provisioning, against a real database.

THESE RUN REAL DDL AND READ REAL TABLES. There is no honest alternative: the
point of provisioning is that `CREATE DATABASE` runs, that `migrate` puts the
right tables in the new database and -- the part that actually matters -- that
it puts NONE of the wrong ones there. Mocking that would assert we called the
functions we wrote, which is not the question being asked.

Two pieces of test machinery are needed, both for reasons worth knowing:

`CREATE DATABASE` IS DDL AND MYSQL COMMITS IT IMPLICITLY. Not just the new
database -- the implicit commit commits THE WHOLE TEST TRANSACTION, so rows
inserted earlier in the test become permanent and pytest-django's rollback has
nothing left to undo. The first run of this file proved it: the second test
died on a duplicate activation code left behind by the first. Hence
`transaction=True`, which cleans up by TRUNCATE instead, plus
`serialized_rollback=True`, because that truncate would otherwise take the
seeded catalogue with it and `sign_up()` needs the nine roles.

THE TENANT ALIAS IS PRE-DECLARED IN `conftest.py`. Django's test guard refuses
any connection it was not told about at setup, and a database-per-tenant alias
is registered at runtime, so it can never be on that list. See the conftest for
the full explanation. It is why the organisations below are pointed at one
fixed database name rather than their derived one; derivation is covered by
`test_signup.py`, which needs no connection.
"""

from __future__ import annotations

import itertools

import pytest
from django.db import connections, transaction
from django.utils import timezone

from conftest import TEST_TENANT_ALIAS
from core.organizations.models import ActivationCode, Organization
from core.organizations.services import sign_up
from core.organizations.tasks import provision_tenant
from core.organizations.tenancy import (
    UnsafeTenantDatabaseNameError,
    assert_safe_db_name,
    create_tenant_database,
    drop_tenant_database,
    register_tenant_connection,
)

# `databases` names the tenant alias explicitly. `__all__` does not work --- it
# resolves at setup too, so it cannot cover an alias created later.
pytestmark = pytest.mark.django_db(
    transaction=True,
    serialized_rollback=True,
    databases=["default", TEST_TENANT_ALIAS],
)

_counter = itertools.count()

# No cleanup fixture: `conftest.py` declares this database, so the test runner
# creates it at the start of the session and drops it at the end. A test that
# drops it mid-run must leave it created, or the runner's teardown warns about
# a database that is not there.


def make_org() -> Organization:
    """
    An organisation pointed at the suite's declared tenant database.

    Built directly rather than through `sign_up()`, because these tests are
    about provisioning and signup brings an activation code, a user and a
    membership that none of them look at. The two tests that DO care about the
    signup path use `found_test_tenant()` below.
    """
    n = next(_counter)
    return Organization.objects.create(
        name=f"Acme Motors {n}",
        slug=f"acme-motors-{n}",
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
    )


def found_test_tenant() -> Organization:
    """
    Sign up for real, landing on the declared tenant database.

    "Test Tenant" slugifies to `test-tenant`, which derives a `db_name` of
    `xpredict_test_tenant` --- the declared alias. So the whole signup path
    runs genuinely, including `schedule_provisioning`, and the database it
    reaches for is one Django will allow.

    REPOINTING `db_name` AFTERWARDS DOES NOT WORK, which is why this is shaped
    around the name instead. Under `transaction=True` the signup transaction
    commits as it exits, so the `on_commit` callback fires INSIDE `sign_up()`
    --- with whatever `db_name` was set at that moment.
    """
    n = next(_counter)
    code = f"CODE-{n}"
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name="Test Tenant",
        email=f"owner{n}@acme.test",
        password="correct-horse-battery-staple",
    ).organization


def tables_in(alias: str) -> set[str]:
    return set(connections[alias].introspection.table_names())


class TestTheDatabaseNameIsNotTrusted:
    """
    A database name cannot be a bound parameter -- `CREATE DATABASE %s` is not
    valid SQL -- so it is interpolated, and anything interpolated into SQL has
    to be proved safe at the point of use.
    """

    def test_a_name_outside_the_tenant_pattern_is_refused(self):
        with pytest.raises(UnsafeTenantDatabaseNameError):
            assert_safe_db_name("mysql")

    def test_an_injection_attempt_is_refused(self):
        with pytest.raises(UnsafeTenantDatabaseNameError):
            assert_safe_db_name("xpredict_x`; DROP DATABASE xpredict_control; --")

    def test_a_name_without_the_granted_prefix_is_refused(self):
        """
        The dev grant is on `xpredict\\_%`, so a name outside it could not be
        created anyway. Refusing here turns a confusing privilege error into a
        clear one.
        """
        with pytest.raises(UnsafeTenantDatabaseNameError):
            assert_safe_db_name("acme_motors")

    def test_a_real_derived_name_is_accepted(self):
        assert_safe_db_name("xpredict_acme_motors")


class TestProvisioning:
    def test_it_creates_the_database_and_stamps_the_organization(self):
        organization = make_org()

        # DROPPED FIRST, on purpose. The runner created this database at setup
        # because conftest declares it, so without this the CREATE is a no-op
        # and the assertion would pass against a database provisioning never
        # touched.
        drop_tenant_database(organization)

        provision_tenant(str(organization.pk))

        organization.refresh_from_db()
        assert organization.provisioned_at is not None
        assert organization.is_ready is True

        # Asked of MySQL, not inferred from the task returning quietly.
        alias = register_tenant_connection(organization)
        with connections[alias].cursor() as cursor:
            cursor.execute("SELECT DATABASE()")
            assert cursor.fetchone()[0] == TEST_TENANT_ALIAS

    def test_no_control_plane_table_lands_in_the_tenant_database(self):
        """
        THE ONE THAT MATTERS. `allow_migrate` is what keeps identity out of
        tenant databases, and `Applying x.0001_initial... OK` says nothing
        about whether it worked -- Django prints that line whether it built the
        tables or the router refused every operation in the migration.

        So this reads the tables. An `accounts_user` here would mean every
        tenant database carried a copy of the platform's identity tables, which
        is the exact failure database-per-tenant exists to prevent.
        """
        organization = make_org()

        provision_tenant(str(organization.pk))
        tables = tables_in(register_tenant_connection(organization))

        for forbidden in (
            "accounts_user",
            "organizations_organization",
            "organizations_membership",
            "organizations_activationcode",
            "permissions_permission",
            "permissions_role",
            "billing_appsubscription",
            "django_admin_log",
        ):
            assert forbidden not in tables, forbidden

    def test_the_tenant_database_is_almost_empty_today_and_that_is_correct(self):
        """
        `TENANT_APPS` have no models yet -- the illustrative one was deleted in
        session 7 precisely so it would not land a placeholder table in every
        tenant database -- so `migrate` builds Django's own bookkeeping and
        nothing else.

        Written as an assertion rather than left as a surprise: the first DMS
        model will fail this test, and the right response is to add it here,
        not to wonder whether provisioning ever worked.
        """
        organization = make_org()

        provision_tenant(str(organization.pk))

        assert tables_in(register_tenant_connection(organization)) == {"django_migrations"}

    def test_running_it_twice_is_safe(self):
        """
        It runs after the web request has already committed, so there is no
        caller left to report failure to and "run it again" is the only
        recovery available. A duplicate delivery is also normal under
        acks_late.
        """
        organization = make_org()

        provision_tenant(str(organization.pk))
        organization.refresh_from_db()
        first_stamp = organization.provisioned_at

        provision_tenant(str(organization.pk))
        organization.refresh_from_db()

        # The second run is a no-op, not a re-provision: the stamp is what says
        # "done", so it must not move.
        assert organization.provisioned_at == first_stamp

    def test_it_does_nothing_for_an_organization_already_stamped(self):
        organization = make_org()
        stamp = timezone.now()
        Organization.objects.filter(pk=organization.pk).update(provisioned_at=stamp)

        provision_tenant(str(organization.pk))

        organization.refresh_from_db()
        assert organization.provisioned_at == stamp

    def test_create_is_safe_to_repeat(self):
        organization = make_org()

        create_tenant_database(organization)
        create_tenant_database(organization)


class TestSignupSchedulesIt:
    def test_signing_up_provisions_the_database(self):
        """
        End to end, the way development runs it: signup commits, the on_commit
        callback fires, and because dev sets CELERY_TASK_ALWAYS_EAGER the task
        runs inline. One call to `sign_up()` leaves a real, migrated database.

        In PRODUCTION the same callback hands the job to a worker and returns,
        so the database appears a moment later -- which is the whole reason
        `is_ready` and the provisioning screen exist at all.
        """
        organization = found_test_tenant()

        organization.refresh_from_db()
        assert organization.db_name == TEST_TENANT_ALIAS
        assert organization.provisioned_at is not None
        assert tables_in(register_tenant_connection(organization)) == {"django_migrations"}

    def test_it_is_scheduled_on_commit_and_not_called_inline(self):
        """
        THE DISTINCTION THIS TEST EXISTS FOR. Inside an atomic block an
        on_commit callback is DEFERRED; a function called inline would run
        immediately. So wrapping signup in a transaction that is still open
        must leave the organisation unprovisioned.

        It matters because `CREATE DATABASE` is DDL MySQL cannot roll back: a
        task called inline would leave an orphan database behind every time a
        signup failed after it.
        """
        with transaction.atomic():
            organization = found_test_tenant()

            organization.refresh_from_db()
            assert organization.provisioned_at is None

        # Out of the block the commit has happened, so the task has run.
        organization.refresh_from_db()
        assert organization.provisioned_at is not None
