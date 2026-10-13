"""
Base model and mixins shared by every module.

Rules these encode, from CLAUDE.md:

- UUID primary keys everywhere.
- No foreign keys across databases. Tenant rows reference control-plane rows
  (users, business units) with plain UUID fields, never a ForeignKey.
- Unit-scoped models filter by the `allowed_units` contextvar, which is
  resolved per app --- meaningless in CRM, load-bearing in DMS (C5, C7).

Everything here is abstract: `shared` is not a Django app, owns no tables and
has no migrations. It is the bottom of the dependency graph --- no business
logic, and no imports from core/, products/ or config/, enforced by
import-linter.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from django.db import models

# Set by the tenant middleware from resolve_allowed_units(membership, app).
# None means "no unit restriction" --- either the person is org-level, or the
# app is not unit-aware. It is NOT the same as an empty set, which would mean
# "restricted to nothing".
allowed_units: ContextVar[frozenset[uuid.UUID] | None] = ContextVar("allowed_units", default=None)


class TimestampMixin(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditMixin(models.Model):
    """
    Who created and last changed this row.

    Plain UUIDs, not ForeignKeys: the User table lives in the control database
    and this row may live in a tenant database. A ForeignKey here would be a
    cross-database relation, which the router refuses.
    """

    created_by_user_id = models.UUIDField(null=True, blank=True, editable=False)
    updated_by_user_id = models.UUIDField(null=True, blank=True, editable=False)

    class Meta:
        abstract = True


class BaseModel(TimestampMixin, AuditMixin, models.Model):
    """Default base for every model in the project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class UnitScopedManager(models.Manager):
    """
    Manager for models belonging to a business unit (dealer).

    Only used by unit-aware apps. `allowed_units` of None means unrestricted,
    which is the correct value both for an org-level person and for any request
    into an app that has no units at all.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        allowed = allowed_units.get()
        if allowed is None:
            return qs
        return qs.filter(unit_id__in=allowed)


class UnitScopedModel(BaseModel):
    """
    Base for operational records owned by a dealer.

    `unit_id` is a plain UUID referencing BusinessUnit in the control database.

    Accessing another dealer's record must return 404, not 403 --- the default
    manager filtering the row out of existence is what produces that, so views
    should use `objects` and let get_object_or_404 do the rest. `all_units` is
    the deliberate escape hatch for fleet-wide reporting, and every use of it
    needs to be justified.
    """

    unit_id = models.UUIDField(db_index=True)

    objects = UnitScopedManager()
    # ruff reads `models.Manager()` as a field declaration and flags the
    # ordering; it is a manager, and the Django style order is correct here.
    all_units = models.Manager()  # noqa: DJ012

    class Meta:
        abstract = True
