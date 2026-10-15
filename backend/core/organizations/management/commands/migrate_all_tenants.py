"""
Apply tenant migrations to every organisation's database.

THE OTHER HALF OF `migrate`. A deploy runs `manage.py migrate`, which touches
the CONTROL database and nothing else --- the router sees to that. Every
organisation's own database (C1) is migrated in exactly two places: by
`provision_tenant` when the organisation is created, and by this command
afterwards. Without it, a tenant app's second migration can never reach a
customer who signed up before it was written.

    python manage.py migrate_all_tenants --plan
    python manage.py migrate_all_tenants
    python manage.py migrate_all_tenants acme-motors northway-auto-group
    python manage.py migrate_all_tenants --keep-going

IT RUNS THE SAME LOOP `provision_tenant` RUNS, deliberately. If the two ever
diverge, an organisation created yesterday and one created today end up on
different schemas, and the difference shows up as a missing column months
later. There is one definition of "what a tenant database should contain" and
it is `tenant_migration_targets()`.

STOPS ON THE FIRST FAILURE, which is the owner's decision and the safer
default on MySQL. MySQL cannot roll back DDL, so a migration that fails halfway
leaves that database in a state Django has not recorded --- a rerun then tries
to redo work already done and fails again, needing a human. If the cause is the
MIGRATION rather than the customer, carrying on would do that to every database
instead of one. `--keep-going` is for when you have looked and know the failure
is specific to one organisation.

RESUMABILITY IS DJANGO'S, NOT OURS. Each tenant database has its own
`django_migrations` table, so re-running skips what it already holds. This
command adds no bookkeeping of its own; it only has to avoid losing the record
of what succeeded before a failure, which is why the summary prints even when
the run stops early.

NOT CONCURRENT, on purpose. The production box runs MySQL beside Django on 2
GiB; ten simultaneous migrations is how the kernel comes to kill the database.
Sequential is slower and the output can be read.

WHAT IT DOES NOT DO: it never touches the control database, it cannot roll
anything back (MySQL again --- a wrong migration is fixed by writing another
one), and it takes no lock against signups. An organisation created while this
runs gets the new schema from `provision_tenant` and needs nothing from here.
"""

from __future__ import annotations

import io
from typing import Any

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from core.organizations.models import Organization
from core.organizations.tenancy import register_tenant_connection, tenant_migration_targets


class Command(BaseCommand):
    help = "Apply tenant migrations to every provisioned organisation's database."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "slugs",
            nargs="*",
            help=(
                "Organisations to migrate, by slug. Default is all of them. "
                "Naming one is how you retry after a failure."
            ),
        )
        parser.add_argument(
            "--plan",
            action="store_true",
            help=(
                "Show which organisations are behind and what would be applied. "
                "Touches nothing."
            ),
        )
        parser.add_argument(
            "--keep-going",
            action="store_true",
            help=(
                "Carry on after a failure instead of stopping. Only when you know "
                "the failure is specific to one organisation."
            ),
        )

    def handle(self, *args: Any, **options: Any) -> None:
        # SLUGS ARE VALIDATED FIRST, BEFORE the "is there anything to do"
        # check below, and running it the other way round is how this was
        # written at first. With no tenant migrations, a mistyped slug got the
        # cheerful "every tenant database is already up to date" -- so somebody
        # correcting one organisation would have been told the opposite of the
        # truth about an organisation that does not exist.
        organizations = self._select(options["slugs"])

        targets = tenant_migration_targets()

        if not targets:
            # NOT AN ERROR. No tenant app has migrations yet, so there is
            # genuinely nothing to apply and every database is already correct.
            # Saying so beats a silent success that looks like work was done.
            self.stdout.write(
                "No tenant app has migrations, so there is nothing to apply. "
                "Every tenant database is already up to date."
            )
            return

        # SPLIT BEFORE DOING ANYTHING. An unprovisioned organisation has no
        # database to migrate, and trying produces a connection error that
        # reads like a server fault rather than a known state. It is reported
        # and pointed at the command that does fix it (C50).
        ready = [o for o in organizations if o.is_ready]
        unprovisioned = [o for o in organizations if not o.is_ready]

        self.stdout.write(
            f"{len(targets)} tenant app(s) with migrations: {', '.join(targets)}"
        )
        self.stdout.write(f"{len(ready)} provisioned organisation(s) to consider.\n")

        if options["plan"]:
            self._report_plan(ready, targets)
            self._report_unprovisioned(unprovisioned)
            return

        migrated: list[str] = []
        unchanged: list[str] = []
        failure: tuple[str, Exception] | None = None
        failures: list[tuple[str, Exception]] = []

        for organization in ready:
            try:
                applied = self._migrate(organization, targets)
            # Broad on purpose: a migration can fail with an OperationalError,
            # a ProgrammingError or anything a data migration chose to raise,
            # and all of them mean the same thing here -- this organisation did
            # not get the schema. It is reported and re-raised as a CommandError
            # at the end, so nothing is swallowed.
            except Exception as exc:
                failures.append((organization.slug, exc))
                self.stderr.write(self.style.ERROR(f"  {organization.slug}: FAILED -- {exc}"))

                if not options["keep_going"]:
                    failure = (organization.slug, exc)
                    break
                continue

            if applied:
                migrated.append(organization.slug)
                self.stdout.write(self.style.SUCCESS(f"  {organization.slug}: migrated"))
            else:
                unchanged.append(organization.slug)
                self.stdout.write(f"  {organization.slug}: already up to date")

        # THE SUMMARY PRINTS EVEN WHEN THE RUN STOPPED EARLY. Half a migration
        # across thirty customers is survivable; not knowing which half is not,
        # and the symptom of guessing wrong is 500s for a subset of them.
        self._report_summary(migrated, unchanged, failures, stopped=failure is not None)
        self._report_unprovisioned(unprovisioned)

        if failures:
            raise CommandError(
                f"{len(failures)} organisation(s) failed. "
                "Fix the cause, then re-run -- organisations already migrated are skipped."
            )

    # -- the work ----------------------------------------------------------

    def _migrate(self, organization: Organization, targets: list[str]) -> bool:
        """
        Migrate one organisation. Returns whether anything was applied.

        NAMED APPS, NOT A BARE `migrate`, for the same reason `provision_tenant`
        does it: a bare migrate hands Django every migration and lets the router
        veto them one at a time --- and Django RECORDS a migration as applied
        whether or not the router allowed a single operation. A tenant database
        would end up claiming the control plane's migrations while holding none
        of their tables.
        """
        alias = register_tenant_connection(organization)
        before = self._applied_count(alias)

        for app_label in targets:
            # Output captured rather than printed: thirty organisations times
            # five apps of Django's own "Applying ... OK" lines buries the one
            # line that matters. What this command prints is per organisation.
            call_command(
                "migrate",
                app_label,
                database=alias,
                interactive=False,
                verbosity=0,
                stdout=io.StringIO(),
            )

        return self._applied_count(alias) > before

    @staticmethod
    def _applied_count(alias: str) -> int:
        """
        How many migrations this database records as applied.

        COUNTED RATHER THAN TRUSTING `migrate`'s OUTPUT, which is the lesson
        this project keeps relearning: `Applying x.0001_initial... OK` is
        printed whether or not anything was built. A difference in this number
        is the only evidence that work happened.

        Zero for a database that has never been migrated at all --- Django
        creates `django_migrations` on first use, so its absence is the honest
        answer rather than an error.
        """
        connection = connections[alias]
        with connection.cursor() as cursor:
            if "django_migrations" not in connection.introspection.table_names(cursor):
                return 0
            cursor.execute("SELECT COUNT(*) FROM django_migrations")
            row = cursor.fetchone()
            return int(row[0]) if row else 0

    # -- selection and reporting -------------------------------------------

    def _select(self, slugs: list[str]) -> list[Organization]:
        if not slugs:
            return list(Organization.objects.order_by("created_at"))

        found = list(Organization.objects.filter(slug__in=slugs).order_by("created_at"))
        missing = sorted(set(slugs) - {o.slug for o in found})

        if missing:
            # Refused rather than skipped: a typo in a slug would otherwise
            # look like a successful run that quietly did less than asked.
            raise CommandError(f"No organisation with slug(s): {', '.join(missing)}.")

        return found

    def _report_plan(self, organizations: list[Organization], targets: list[str]) -> None:
        behind: list[str] = []

        for organization in organizations:
            alias = register_tenant_connection(organization)
            plan = io.StringIO()
            # `--plan` on Django's own migrate lists what WOULD run, without
            # running it. An empty list means this database is current.
            for app_label in targets:
                call_command(
                    "migrate",
                    app_label,
                    database=alias,
                    plan=True,
                    interactive=False,
                    verbosity=1,
                    stdout=plan,
                )

            pending = [
                line.strip()
                for line in plan.getvalue().splitlines()
                if line.strip().startswith("[ ]")
            ]

            if pending:
                behind.append(organization.slug)
                self.stdout.write(f"  {organization.slug}: {len(pending)} to apply")
                for line in pending:
                    self.stdout.write(f"      {line}")
            else:
                self.stdout.write(f"  {organization.slug}: up to date")

        self.stdout.write("")
        if behind:
            names = ", ".join(behind)
            self.stdout.write(
                self.style.WARNING(f"{len(behind)} organisation(s) need migrating: {names}")
            )
        else:
            self.stdout.write(self.style.SUCCESS("Every organisation is up to date."))

    def _report_summary(
        self,
        migrated: list[str],
        unchanged: list[str],
        failures: list[tuple[str, Exception]],
        *,
        stopped: bool,
    ) -> None:
        self.stdout.write("")
        self.stdout.write(
            f"Migrated {len(migrated)}, already current {len(unchanged)}, failed {len(failures)}."
        )

        if migrated:
            self.stdout.write(f"  migrated: {', '.join(migrated)}")
        if failures:
            self.stdout.write(f"  failed:   {', '.join(slug for slug, _ in failures)}")

        if stopped:
            # SAID OUT LOUD, because the dangerous reading of this output is
            # "everything not listed is fine". Everything not listed was never
            # attempted.
            self.stdout.write(
                self.style.WARNING(
                    "Stopped at the first failure -- organisations after it were NOT attempted. "
                    "Pass --keep-going once you know the failure is specific to one of them."
                )
            )

    def _report_unprovisioned(self, organizations: list[Organization]) -> None:
        if not organizations:
            return

        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                f"{len(organizations)} organisation(s) have no database and were skipped: "
                f"{', '.join(o.slug for o in organizations)}"
            )
        )
        self.stdout.write("  Their provisioning never finished. Repair each with:")
        self.stdout.write("    manage.py reprovision_tenant <slug>")
