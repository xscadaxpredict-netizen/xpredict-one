"""
Re-run provisioning for one organisation (C50).

WHY THIS EXISTS. `provision_tenant` retries five times with backoff and then
gives up permanently. After that the organisation is real, the activation code
is spent, the owner can sign in -- and `provisioned_at` is NULL forever. Before
this command the only recovery was opening a Django shell on production.

    python manage.py reprovision_tenant northway-auto-group
    python manage.py reprovision_tenant northway-auto-group --force

IT IS NEARLY FREE because the task is already idempotent: `CREATE DATABASE IF
NOT EXISTS`, then `migrate`, which applies only what is missing. This is a
thin, visible way to call it rather than new logic.

NOTHING TELLS YOU TO RUN IT, and that is the rest of Q33. Somebody has to
notice first, and today the only trace of a failed provision is a log line in a
worker. A `list_unprovisioned` command was offered and declined on the grounds
that a command nobody runs is not detection -- the real answer is an alert, and
that wants Sentry (Phase 7).
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from core.organizations.models import Organization
from core.organizations.tasks import provision_tenant
from core.organizations.tenancy import register_tenant_connection


class Command(BaseCommand):
    help = "Create and migrate an organisation's database, for one that failed."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("slug", help="The organisation's slug, as it appears in URLs.")
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "Run even if the organisation is already marked provisioned. "
                "For a database that was lost or dropped underneath a working row."
            ),
        )

    def handle(self, *args: Any, **options: Any) -> None:
        slug = options["slug"]

        try:
            organization = Organization.objects.get(slug=slug)
        except Organization.DoesNotExist as exc:
            # CommandError, not a stack trace: a typo in a slug is the most
            # likely way to arrive here and it is not a bug.
            raise CommandError(f"No organisation with slug {slug!r}.") from exc

        if organization.is_ready and not options["force"]:
            # REFUSED RATHER THAN SILENTLY SKIPPED. The task itself returns
            # early for an organisation already stamped, so running it would
            # do nothing and report success -- which reads as "repaired" to
            # somebody working through an incident.
            when = organization.provisioned_at.strftime("%Y-%m-%d %H:%M")
            raise CommandError(
                f"{slug!r} is already provisioned (at {when}). "
                "Pass --force if its database is actually missing."
            )

        if options["force"]:
            # Clear the stamp so the task does its work instead of returning
            # early. This is the only thing --force does.
            Organization.objects.filter(pk=organization.pk).update(provisioned_at=None)
            organization.refresh_from_db()

        self.stdout.write(f"Provisioning {slug} -> {organization.db_name} ...")

        # CALLED DIRECTLY, not with .delay(). There is no web request to keep
        # waiting and no transaction to commit first, so the on_commit dance
        # does not apply -- and an operator running this needs to see it fail,
        # not hand it to a worker whose log they then have to find.
        provision_tenant(str(organization.pk))

        organization.refresh_from_db()
        if not organization.is_ready:
            raise CommandError(
                f"{slug!r} is still not marked provisioned. Check the output above."
            )

        alias = register_tenant_connection(organization)
        tables = sorted(connections[alias].introspection.table_names())

        self.stdout.write(
            self.style.SUCCESS(f"{slug} is ready (provisioned_at set, {len(tables)} table(s)).")
        )
        # Printed because "it worked" is not the same claim as "the tables are
        # there", and this project has been caught by that difference before:
        # `Applying x.0001_initial... OK` is printed whether or not anything
        # was built. An empty list is correct while no tenant app has models.
        self.stdout.write(f"  tables: {tables or '(none yet -- no tenant app has models)'}")
