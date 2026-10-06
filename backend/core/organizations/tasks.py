"""
Background work for organizations.

Every task takes `org_id` and resolves its own context from it. A task that
relies on ambient context runs against whatever database the worker touched
last, which in a database-per-tenant system is somebody else's data.
"""

from __future__ import annotations

import logging

from celery import shared_task
from django.core.management import call_command
from django.db import transaction
from django.utils import timezone

from core.organizations.models import Organization
from core.organizations.tenancy import (
    create_tenant_database,
    register_tenant_connection,
    tenant_migration_targets,
)

logger = logging.getLogger(__name__)


@shared_task(
    name="core.organizations.provision_tenant",
    # Creating and migrating a database fails for operational reasons --- MySQL
    # restarting, a connection limit, a lock --- and those are worth retrying.
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def provision_tenant(org_id: str) -> str:
    """
    Create this organization's database and migrate it (C1).

    FIRED ON `transaction.on_commit` AFTER SIGNUP, never inside the signup
    transaction. Two reasons, and both have bitten real projects: a task queued
    inside a transaction can be picked up by a worker before the row it needs
    is visible, and `CREATE DATABASE` is DDL that MySQL cannot roll back --- so
    a signup that failed afterwards would leave an orphan database behind.

    IDEMPOTENT, because it has to be. It runs after the web request has already
    committed, so there is no caller left to report failure to and "run it
    again" is the only recovery available. Each step is safe to repeat:
    `CREATE DATABASE IF NOT EXISTS`, then `migrate`, which applies only what is
    missing, and finally the stamp.

    IT CREATES AN EMPTY DATABASE TODAY, and that is correct rather than broken.
    `TENANT_APPS` have no models yet --- the one illustrative model was deleted
    in session 7 precisely so it would not land a placeholder table in every
    tenant database --- so there is nothing to migrate and the database is
    created with no tables in it. The moment the first DMS model exists, every
    provisioned tenant gets its table from `migrate_all_tenants`, which is the
    next piece of this and does not exist yet.
    """
    organization = Organization.objects.get(pk=org_id)

    if organization.provisioned_at is not None:
        # Already done. Returning rather than raising: a duplicate delivery is
        # normal with acks_late, and it is not an error worth a retry.
        logger.info(
            "tenant_already_provisioned",
            extra={"org_id": str(organization.pk), "db_name": organization.db_name},
        )
        return organization.db_name

    create_tenant_database(organization)
    alias = register_tenant_connection(organization)

    # NAMED APPS, NOT A BARE `migrate`. A bare migrate means "apply
    # everything" and leaves the router to veto each operation one at a time.
    # It does veto them, so no control-plane TABLE is ever built here --- but
    # Django records a migration as applied whether or not the router allowed
    # a single one of its operations, so a tenant database ended up claiming
    # all 39 control-plane migrations while holding none of their tables.
    #
    # `tenant_migration_targets()` has the full reasoning. The short version:
    # that bookkeeping is a trap for whoever first moves an app between
    # CONTROL_PLANE_APPS and TENANT_APPS.
    #
    # IT IS AN EMPTY LIST TODAY, so this loop does not run and a fresh tenant
    # database has NO tables at all --- not even `django_migrations`, which
    # Django creates only when it first records something. Correct rather than
    # broken: no tenant app has a model yet.
    #
    # One to watch, and not provable until a tenant migration exists: migrating
    # an app also applies its DEPENDENCIES. A tenant migration that depended on
    # a control-plane one would drag it back in. It should not be able to ---
    # tenant rows reference control-plane rows by plain UUID and never by
    # foreign key (C1) --- and `test_the_tenant_bookkeeping_names_no_control_app`
    # is what would catch it.
    for app_label in tenant_migration_targets():
        call_command("migrate", app_label, database=alias, interactive=False, verbosity=0)

    # .update(), not .save(): a plain save would write back every field loaded
    # at the top of this task, and minutes may have passed. If an admin renamed
    # the organization in the meantime, save() would quietly restore the old
    # name.
    Organization.objects.filter(pk=organization.pk).update(provisioned_at=timezone.now())

    logger.info(
        "tenant_provisioned",
        extra={"org_id": str(organization.pk), "db_name": organization.db_name},
    )
    return organization.db_name


def schedule_provisioning(organization: Organization) -> None:
    """
    Queue provisioning for after the current transaction commits.

    A SERVICE CALLS THIS, never `.delay()` directly, so the on_commit rule
    lives in one place instead of being remembered at each call site.
    """
    org_id = str(organization.pk)
    transaction.on_commit(lambda: provision_tenant.delay(org_id))
