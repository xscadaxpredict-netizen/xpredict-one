"""
`manage.py migrate_all_tenants` -- the other half of `migrate`.

WHAT IS REAL HERE AND WHAT IS NOT, stated plainly because the split is
unusual and the reason for it is temporary.

The command's own logic -- which organisations are selected, what stops the
run, what is reported -- is tested for real. That is the part being written,
and it is the part that will be wrong.

THAT DAY HAS ARRIVED, and this file was written expecting it. The DMS
modules brought nineteen tenant migrations, so `tenant_migration_targets()`
no longer returns an empty list and the "nothing to do" branch is
unreachable. `TestAnOrganisationAlreadyMigrated` is the real test that
replaced the one pinning it, against the tenant database the suite builds.

The REST of this file still patches, and deliberately: `TestSelection` and the
failure handling are about which organisations the loop visits and what stops
it, and standing up thirty real tenant databases to count them would test
MySQL rather than the command. The application path is covered by
`test_provisioning.py`, which refuses to mock exactly this, and by the test
above. That file is the model,
because it refuses to mock exactly this.

`provision_tenant` already applies tenant migrations for real and is tested
that way, and this command deliberately calls the same `tenant_migration_targets()`
loop -- so the application path is covered where it belongs.
"""

from __future__ import annotations

import io
import itertools
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from conftest import TEST_TENANT_ALIAS
from core.organizations.models import Organization

pytestmark = pytest.mark.django_db(
    transaction=True,
    serialized_rollback=True,
    databases=["default", TEST_TENANT_ALIAS],
)

_counter = itertools.count(1)

COMMAND = "core.organizations.management.commands.migrate_all_tenants"


def make_org(
    *, provisioned: bool = True, slug: str | None = None, real: bool = False
) -> Organization:
    """
    An organisation for the command to find.

    EACH ONE GETS ITS OWN `db_name`, because the column is unique -- several
    organisations cannot share the suite's declared alias, which is what the
    first version of this file tried and what MySQL refused.

    That is fine for every test that patches `_migrate`: no connection is ever
    opened, so the name only has to exist and be plausible. `real=True` is for
    the one test that lets `_migrate` run, which does connect -- it needs the
    alias `conftest.py` declared, because Django's test guard refuses any
    connection it was not told about at setup.
    """
    n = next(_counter)
    return Organization.objects.create(
        name=f"Acme Motors {n}",
        slug=slug or f"acme-motors-{n}",
        db_name=TEST_TENANT_ALIAS if real else f"xpredict_fake_tenant_{n}",
        db_host="127.0.0.1",
        db_port=3306,
        provisioned_at=timezone.now() if provisioned else None,
    )


def run(*args, **options) -> str:
    """Run the command, returning everything it printed."""
    out = io.StringIO()
    call_command("migrate_all_tenants", *args, stdout=out, stderr=out, **options)
    return out.getvalue()



class TestNowThatTenantAppsHaveMigrations:
    """
    REPLACES `test_it_says_so_rather_than_claiming_success`, WHOSE PREMISE
    EXPIRED. That test asserted the "No tenant app has migrations" branch --
    the honest answer while `tenant_migration_targets()` returned an empty
    list. The DMS modules brought nineteen migrations across five apps, so the
    branch is now unreachable and the test was pinning code that can no longer
    run.

    IT FAILED LOUDLY RATHER THAN QUIETLY, which is the part worth keeping:
    with real targets the command tried to reach `xpredict_fake_tenant_1` -- a
    database `make_org()` names but never creates -- and raised `CommandError`
    saying one organisation failed. That is the command working, and the first
    evidence it does what it claims, so it is now asserted on purpose below.

    WHAT IS STILL NOT TESTED HERE, stated rather than implied: a real
    migration being APPLIED to a real tenant database. The suite's tenant
    alias already holds the DMS tables -- pytest-django built them when it
    created the test database -- while that database's own
    `django_migrations` does not record them, so a real run collides with
    `Table 'dms_sales_bankaccount' already exists`. That is an artefact of the
    test harness, not the command: `provision_tenant` applies these same
    targets for real and `test_provisioning.py` reads the tables back out.
    Proving it for THIS command needs a tenant database the suite did not
    build, which is a conftest change rather than a test, and it is recorded
    in the session log instead of being faked here.
    """

    def test_the_targets_are_the_real_tenant_apps(self):
        """
        The list that used to be empty. `--plan` touches no schema, so this is
        the cheap half of the proof: the command now has real work to name.
        """
        make_org(real=True)

        output = run("--plan")

        assert "5 tenant app(s) with migrations" in output
        for label in (
            "dms_ecommerce",
            "dms_sales",
            "dms_site_services",
            "dms_tech_support",
            "dms_tools",
        ):
            assert label in output

    def test_an_organisation_whose_database_is_missing_is_reported_not_skipped(self):
        """
        THE FAILURE MODE THE RUNBOOK DEPENDS ON. `deploy/README.md` says not to
        continue past a failure here, which is only safe if a failure is
        actually reported -- a command that skipped an unreachable database
        and printed a summary would read as success and leave that customer
        with no schema.

        `make_org()` gives an organisation a `db_name` nothing ever created,
        which is exactly that situation.
        """
        make_org(slug="never-provisioned-for-real")

        with pytest.raises(CommandError, match=r"1 organisation\(s\) failed"):
            run()

    def test_a_mistyped_slug_is_refused_even_then(self):
        """
        THE ORDER OF TWO CHECKS, AND RUNNING IT IS WHAT FOUND THIS. The
        "nothing to do" branch used to come first, so a typo got the cheerful
        "every tenant database is already up to date" -- the opposite of the
        truth, about an organisation that does not exist.
        """
        make_org(slug="acme-motors")

        with pytest.raises(CommandError, match="nope-not-real"):
            run("nope-not-real")


class TestSelection:
    def test_every_organisation_by_default(self):
        for _ in range(3):
            make_org()

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", return_value=False) as migrate:
                run()

        assert migrate.call_count == 3

    def test_named_organisations_only(self):
        make_org(slug="acme-motors")
        make_org(slug="northway")
        make_org(slug="untouched")

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", return_value=False) as migrate:
                run("acme-motors", "northway")

        visited = sorted(call.args[0].slug for call in migrate.call_args_list)
        assert visited == ["acme-motors", "northway"]

    def test_an_unknown_slug_refuses_the_whole_run(self):
        """
        REFUSED, NOT SKIPPED. Skipping would run successfully while doing less
        than it was asked, and the operator would read the success.
        """
        make_org(slug="acme-motors")

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate") as migrate:
                with pytest.raises(CommandError, match="typo-here"):
                    run("acme-motors", "typo-here")

        assert migrate.call_count == 0


class TestUnprovisionedOrganisations:
    def test_they_are_not_attempted(self):
        """
        An organisation whose provisioning never finished has no database.
        Trying to migrate it produces a connection error that reads like a
        server fault rather than a known, repairable state.
        """
        make_org(slug="working")
        make_org(slug="never-finished", provisioned=False)

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", return_value=False) as migrate:
                output = run()

        visited = [call.args[0].slug for call in migrate.call_args_list]
        assert visited == ["working"]
        assert "never-finished" in output

    def test_they_are_pointed_at_the_command_that_repairs_them(self):
        make_org(slug="never-finished", provisioned=False)

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            output = run()

        assert "reprovision_tenant" in output


class TestStoppingOnFailure:
    """
    THE OWNER'S DECISION, and the reason is MySQL. It cannot roll back DDL, so
    a migration that fails halfway leaves that database in a state Django has
    not recorded -- and if the cause is the migration rather than the customer,
    carrying on does that to every database instead of one.
    """

    def test_it_stops_at_the_first_failure(self):
        """
        THE ASSERTION IS WHAT WAS NEVER ATTEMPTED, not that it raised.

        The first version of this test only checked for `CommandError` -- and
        a revert proved that passes whether the command stops or not, because
        a failure raises at the end either way. It was a test of its own title.
        """
        for slug in ("first", "second", "third"):
            make_org(slug=slug)

        attempted: list[str] = []

        def explode(self, organization, targets):
            attempted.append(organization.slug)
            if organization.slug == "second":
                raise RuntimeError("table already exists")
            return True

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", explode):
                with pytest.raises(CommandError):
                    run()

        # "third" must never have been touched.
        assert attempted == ["first", "second"]

    def test_it_says_which_were_never_attempted(self):
        """
        THE DANGEROUS READING of this output is "everything not listed is
        fine". Everything after the failure was never tried, and the command
        has to say so -- otherwise the operator believes a partial run was a
        complete one.
        """
        for slug in ("first", "second", "third"):
            make_org(slug=slug)

        def explode(self, organization, targets):
            if organization.slug == "second":
                raise RuntimeError("table already exists")
            return True

        out = io.StringIO()
        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", explode):
                with pytest.raises(CommandError):
                    call_command("migrate_all_tenants", stdout=out, stderr=out)

        output = out.getvalue()
        assert "NOT attempted" in output
        # And what DID succeed is still reported, which is the whole reason the
        # summary prints on the failure path too.
        assert "first" in output

    def test_keep_going_carries_on(self):
        for slug in ("first", "second", "third"):
            make_org(slug=slug)

        attempted: list[str] = []

        def explode(self, organization, targets):
            attempted.append(organization.slug)
            if organization.slug == "second":
                raise RuntimeError("that one customer")
            return True

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", explode):
                with pytest.raises(CommandError):
                    run(keep_going=True)

        # All three visited, and it still exits non-zero at the end.
        assert attempted == ["first", "second", "third"]

    def test_a_failure_always_ends_in_a_nonzero_exit(self):
        """
        `CommandError` is how a management command exits non-zero. A deploy
        script that ignored this would carry on to "reload services" with half
        the customers unmigrated.
        """
        make_org(slug="doomed")

        def explode(self, organization, targets):
            raise RuntimeError("nope")

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", explode):
                with pytest.raises(CommandError):
                    run(keep_going=True)


class TestReporting:
    def test_it_distinguishes_migrated_from_already_current(self):
        """
        A COUNT OF APPLIED MIGRATIONS, not `migrate`'s output, is what decides
        this -- because `Applying x.0001_initial... OK` is printed whether or
        not anything was built. The difference matters to an operator deciding
        whether a deploy actually did something.
        """
        make_org(slug="changed")
        make_org(slug="current")

        def selectively(self, organization, targets):
            return organization.slug == "changed"

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.Command._migrate", selectively):
                output = run()

        assert "changed: migrated" in output
        assert "current: already up to date" in output
        assert "Migrated 1, already current 1, failed 0." in output

    def test_it_names_the_apps_it_will_apply(self):
        make_org()

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales", "crm"]):
            with patch(f"{COMMAND}.Command._migrate", return_value=False):
                output = run()

        assert "dms_sales" in output
        assert "crm" in output


class TestTheControlDatabaseIsNeverTouched:
    def test_no_migration_is_run_against_default(self):
        """
        THE ONE THING THAT WOULD BE UNRECOVERABLE. `migrate` against `default`
        with a tenant app label would have Django RECORD those migrations as
        applied in the control database while the router built none of their
        tables -- the bookkeeping trap `tenancy.py` documents.

        Asserting on the `database=` argument is the whole point: it is the
        parameter that decides, and nothing else in this command guards it.
        """
        make_org(slug="acme-motors", real=True)

        with patch(f"{COMMAND}.tenant_migration_targets", return_value=["dms_sales"]):
            with patch(f"{COMMAND}.call_command") as inner:
                run()

        assert inner.call_count >= 1
        for call in inner.call_args_list:
            assert call.kwargs["database"] != "default"
            assert call.kwargs["database"] == TEST_TENANT_ALIAS
