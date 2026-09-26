"""
Database routing for the organization-per-database tenancy model (C1).

Two kinds of app exist, and they must never share a database:

- Control-plane apps (users, organizations, business units, memberships, roles,
  app access, subscriptions) always use the `default` connection.
- Tenant apps (all business data) use the database named by the
  `current_tenant_db` contextvar, which the tenant middleware sets per request.

The router FAILS CLOSED. If a tenant app is queried with no tenant context, it
raises rather than silently falling back to `default` --- a silent fallback is
how one organization ends up reading another's data.
"""

from __future__ import annotations

from contextvars import ContextVar

from django.conf import settings

# Set by the tenant middleware (Phase 2) and by Celery tasks, which receive
# org_id as an argument and manage this themselves. Always reset in a finally
# block: worker threads are reused across requests.
current_tenant_db: ContextVar[str | None] = ContextVar("current_tenant_db", default=None)


class TenantContextMissingError(RuntimeError):
    """Raised when a tenant model is used with no tenant database bound."""


def _is_control_plane(app_label: str) -> bool:
    return app_label in settings.CONTROL_PLANE_APP_LABELS


def _require_tenant_db() -> str:
    db = current_tenant_db.get()
    if db is None:
        raise TenantContextMissingError(
            "No tenant database is bound for this operation. A tenant model was "
            "used outside a request with an organization, or inside a Celery task "
            "that did not set tenant context from its org_id argument."
        )
    return db


class TenantRouter:
    def db_for_read(self, model, **hints):
        if _is_control_plane(model._meta.app_label):
            return "default"
        return _require_tenant_db()

    def db_for_write(self, model, **hints):
        if _is_control_plane(model._meta.app_label):
            return "default"
        return _require_tenant_db()

    def allow_relation(self, obj1, obj2, **hints):
        """
        Relations are only allowed within one database.

        There are no foreign keys across databases (C1): tenant rows reference
        control-plane rows by plain UUID (created_by_user_id, unit_id).
        """
        return obj1._state.db == obj2._state.db

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        Keep control-plane tables out of tenant databases and vice versa.

        `db` here is the alias being migrated. The control database is
        `default`; every other alias is an organization's database.
        """
        if db == "default":
            return _is_control_plane(app_label)
        return not _is_control_plane(app_label)
