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
from typing import ClassVar, Final

from django.db import models
from django.db.models.signals import pre_delete, pre_save

from shared.exceptions import ConflictError


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


class HomeMissingError(RuntimeError):
    """
    A child record was saved with no parent to take its home from.

    Every `home_follows` record hangs off a parent (a follow-up off an
    enquiry, a complaint off a site), so this is a programming error --- a
    500, never a guess at where the record should live.
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

    WHERE A RECORD LIVES --- ITS HOME (C72 piece 3 step 3a, C76). Every
    concrete subclass declares EXACTLY ONE of these, and
    `tests/test_record_homes.py` fails for a model that declares neither:

    - `home_kinds`: the kinds of territory this record may be filed at, e.g.
      `("organisation", "region", "dealer", "branch")` for an enquiry. A
      person files it, and `core.api.home_for()` offers only these kinds
      inside the person's subtree. Product structure, decided by us, not a
      per-customer setting.
    - `home_follows`: the parent ForeignKey(s) whose home this record takes
      --- a follow-up lives wherever its enquiry lives, whoever adds it.
      Several names when a record hangs off one of several parents; the
      first that is set wins. `save()` copies the parent's `territory_id`
      every time, so a caller's own place can never leak into a child
      (the bug this replaced: a regional manager's follow-up on a Delhi
      East enquiry was filed at Delhi, the first dealership in their region,
      where Delhi East's people could not see it).
    """

    territory_id = models.UUIDField(db_index=True)

    home_kinds: ClassVar[tuple[str, ...] | None] = None
    home_follows: ClassVar[tuple[str, ...] | None] = None

    objects = TerritoryScopedManager()
    # ruff reads `models.Manager()` as a field declaration and flags the
    # ordering; it is a manager, and the Django style order is correct here.
    all_territories = models.Manager()  # noqa: DJ012

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.home_follows:
            self.territory_id = self._parent_home()
        super().save(*args, **kwargs)

    def _parent_home(self) -> uuid.UUID:
        # Following a ForeignKey upwards uses Django's base manager, so this
        # works whatever `allowed_territories` says (see the manager above).
        for name in self.home_follows or ():
            parent = getattr(self, name)
            if parent is not None:
                return parent.territory_id
        raise HomeMissingError(
            f"{type(self).__name__} takes its home from {self.home_follows}, and none is set."
        )


# ---------------------------------------------------------------------------
# A CLOSED TERRITORY'S RECORDS ARE READ-ONLY (C63, built 2026-11-25 at the
# owner's word): "the records stay, and stay visible ... what stops is
# writing". Closing already shuts out the people placed only there; this stops
# everybody else who can see the records -- the owner too -- from changing
# them until the territory is reopened. Reading is untouched.
#
# PER REQUEST, LIKE `allowed_territories`: `TenantAPIView` sets the ids of the
# organisation's closed DMS territories; the tenant middleware clears it to
# "none" around every request, so nothing leaks to the next one. Outside a
# request (shell, tasks, Delete's record transfer) nothing is closed here.
#
# CHECKED ON EVERY SAVE AND DELETE of a territory record, through Django's
# signals -- so `Model.save()`, `objects.create()`, `instance.delete()` AND
# `queryset.delete()` are all covered. A queryset's `.update()` fires no
# signal and is NOT covered: no DMS service changes a record's content that
# way today (only flags like `is_active`, after a save on its parent that this
# refuses first).
# ---------------------------------------------------------------------------

closed_territories: ContextVar[frozenset[uuid.UUID]] = ContextVar(
    "closed_territories", default=frozenset()
)


class TerritoryClosedError(ConflictError):
    """A record at a closed territory was created, changed or deleted. 409."""

    code = "territory_closed"
    message = (
        "This territory is closed, so its records are read-only. Reopen it to change them."
    )


def _refuse_closed(sender, instance, **kwargs) -> None:
    if isinstance(instance, TerritoryScopedModel) and (
        instance.territory_id in closed_territories.get()
    ):
        raise TerritoryClosedError


pre_save.connect(_refuse_closed, dispatch_uid="territory_closed_refuses_saves")
pre_delete.connect(_refuse_closed, dispatch_uid="territory_closed_refuses_deletes")
