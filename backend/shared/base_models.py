"""
Base model and mixins shared by every module.

Rules these encode, from CLAUDE.md:

- UUID primary keys everywhere.
- No foreign keys across databases. Tenant rows reference control-plane rows
  (users, territories) with plain UUID fields, never a ForeignKey.
- Unit-scoped models filter by the `allowed_territories` contextvar, which is
  resolved per app --- meaningless in CRM, load-bearing in DMS (C5, C7).

Everything here is abstract: `shared` is not a Django app, owns no tables and
has no migrations. It is the bottom of the dependency graph --- no business
logic, and no imports from core/, products/ or config/, enforced by
import-linter.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Final

from django.db import models


class _NotSet:
    """The type of `NOT_SET`. One instance exists; compare with `is`."""

    def __repr__(self) -> str:
        return "<allowed_territories: NOT_SET>"


NOT_SET: Final = _NotSet()
"""
"NOBODY HAS DECIDED WHICH DEALERSHIPS THIS CODE MAY SEE" --- the sentinel.

`allowed_territories` has THREE states, and the third is the point:

- a frozenset: somebody decided, and it is these dealerships (empty = none);
- None: somebody decided, and it is every dealership;
- NOT_SET: nobody decided, and `TerritoryScopedManager` REFUSES to query.

Before this, None meant both "everything, on purpose" and "nobody set it", so
any code path that forgot --- a view not built on `TenantAPIView`, a Celery
task, a management command --- silently read every dealership's records. That
is fail-open, the one thing CLAUDE.md's tenancy rules forbid. Now forgetting is
an exception on the first query, noticed by whoever wrote the code rather than
by a dealer looking at another dealer's enquiries.
"""


class TerritoryScopeMissingError(RuntimeError):
    """
    A dealership-scoped model was queried with `allowed_territories` never set.

    The sibling of `config.routers.TenantContextMissingError`: that one says
    "which DATABASE?" was never answered, this one says "which DEALERSHIPS?"
    was not. A programming error, so a 500 --- never a guess.
    """


# NOT_SET until somebody decides. `TenantAPIView` decides per request from
# `resolve_allowed_territories(membership, app)`; anything else says so explicitly
# with `territory_scope()`. The middleware resets it to NOT_SET at the start of
# every org-scoped request and restores it in a `finally`.
allowed_territories: ContextVar[frozenset[uuid.UUID] | _NotSet | None] = ContextVar(
    "allowed_territories", default=NOT_SET
)


@contextmanager
def territory_scope(territories: frozenset[uuid.UUID] | None) -> Iterator[None]:
    """
    Decide which dealerships the code inside may see, then put it back.

    `territory_scope(None)` is "every dealership, on purpose" --- a fleet-wide
    report, a data fix, a test building rows. Writing it is the point: the
    choice is visible in the code, the way `required_permissions = []` is,
    instead of being what happens when nobody set anything.

    Restores the previous value in a `finally`, so a nested scope or an
    exception cannot leak a wider one outwards.
    """
    token = allowed_territories.set(territories)
    try:
        yield
    finally:
        allowed_territories.reset(token)


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


class TerritoryScopedManager(models.Manager):
    """
    Manager for models belonging to a territory (a dealership, today).

    Only used by unit-aware apps. `allowed_territories` of None means unrestricted,
    which is the correct value both for an org-level person and for any request
    into an app that has no units at all. NOT_SET raises (see `NOT_SET`).

    THIS IS ALSO THE MANAGER BEHIND `.objects.create()` AND REVERSE RELATIONS
    (`enquiry.followups.all()`), so those refuse too when nobody has decided.
    Following a ForeignKey upwards (`quotation.enquiry`) and `Model.save()` use
    Django's plain base manager and are not affected.
    """

    def get_queryset(self):
        allowed = allowed_territories.get()
        if allowed is NOT_SET:
            raise TerritoryScopeMissingError(
                f"{self.model.__name__} was queried with no dealership scope decided. "
                "Inside a DMS request `TenantAPIView` sets it; anywhere else wrap the "
                "code in `territory_scope(...)` -- `territory_scope(None)` for every dealership, "
                "on purpose."
            )
        qs = super().get_queryset()
        if allowed is None:
            return qs
        return qs.filter(territory_id__in=allowed)


class TerritoryScopedModel(BaseModel):
    """
    Base for operational records owned by a dealer.

    `territory_id` is a plain UUID referencing Territory in the control database.

    Accessing another dealer's record must return 404, not 403 --- the default
    manager filtering the row out of existence is what produces that, so views
    should use `objects` and let get_object_or_404 do the rest. `all_territories` is
    the deliberate escape hatch for fleet-wide reporting, and every use of it
    needs to be justified.
    """

    territory_id = models.UUIDField(db_index=True)

    objects = TerritoryScopedManager()
    # ruff reads `models.Manager()` as a field declaration and flags the
    # ordering; it is a manager, and the Django style order is correct here.
    all_territories = models.Manager()  # noqa: DJ012

    class Meta:
        abstract = True
