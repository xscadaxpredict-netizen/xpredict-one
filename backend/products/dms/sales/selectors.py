"""
Read logic for Sales.

Queries live here rather than in views, so a list endpoint, an export and a
dashboard tile all share one definition of "the enquiries this user may see".

Unit scoping is NOT applied by hand here. `Enquiry` inherits `UnitScopedModel`,
whose default manager filters by the `allowed_units` contextvar --- so
`Enquiry.objects` is already scoped to the caller's dealer. Use
`Enquiry.all_units` only for deliberate fleet-wide reporting, and justify it.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from .models import Enquiry

if TYPE_CHECKING:
    from django.db.models import QuerySet


def list_enquiries(*, status: str | None = None) -> QuerySet[Enquiry]:
    """Enquiries the caller may see, newest first. Already dealer-scoped."""
    qs = Enquiry.objects.all()
    if status:
        qs = qs.filter(status=status)
    return qs


def get_enquiry(*, enquiry_id: uuid.UUID) -> Enquiry | None:
    """
    One enquiry, or None if it is not the caller's to see.

    Another dealer's enquiry is indistinguishable from one that does not exist
    --- the manager filtered it out before this query ran. The view turns None
    into 404, which is what stops record existence leaking across dealers.
    """
    return Enquiry.objects.filter(pk=enquiry_id).first()


def count_open_by_unit() -> dict[uuid.UUID, int]:
    """
    Open enquiries per dealer, for the fleet dashboard.

    A deliberate `all_units` use: the fleet dashboard is org-level reporting and
    is only reachable by a caller with org-wide scope. The permission check
    belongs at the endpoint --- this function trusts its caller, so do not call
    it from a dealer-scoped view.
    """
    from django.db.models import Count

    rows = (
        Enquiry.all_units.exclude(
            status__in=[Enquiry.Status.WON, Enquiry.Status.LOST],
        )
        .values("unit_id")
        .annotate(total=Count("id"))
    )
    return {row["unit_id"]: row["total"] for row in rows}
