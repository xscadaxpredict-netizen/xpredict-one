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
from core.organizations.tenancy import create_tenant_database, register_tenant_connection

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

    IT CREATES AN ALMOST-EMPTY DATABASE TODAY, and that is correct rather than
    broken. `TENANT_APPS` have no models yet --- the one illustrative model was
    deleted in session 7 precisely so it would not land a placeholder table in
    every tenant database --- so `migrate` builds `django_migrations` and
    nothing else. The moment the first DMS model exists, every provisioned
    tenant gets its table from `migrate_all_tenants`, which is the next piece
    of this and does not exist yet.
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

    # `database=alias` is what keeps this honest: the router's `allow_migrate`
    # is asked about every operation with that alias and refuses anything
    # control-plane, so identity tables cannot land in a tenant database.
    #
    # And `Applying x.0001_initial... OK` means NOTHING about whether tables
    # were built --- Django prints it either way, including when the router
    # refused every operation in the migration. The tests check the tables.
    call_command("migrate", database=alias, interactive=False, verbosity=0)

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
