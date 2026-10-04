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

from django.db.models import Prefetch

from .models import Enquiry, BankAccount, ProductCatalog, Quotation, Followup

if TYPE_CHECKING:
    from django.db.models import QuerySet


def list_enquiries() -> QuerySet[Enquiry]:
    """Enquiries the caller may see, newest first. Already dealer-scoped."""
    # Pre-fetch relations to avoid N+1 queries.
    return Enquiry.objects.prefetch_related(
        Prefetch("followups", queryset=Followup.objects.order_by("-created_at")),
        Prefetch("quotations", queryset=Quotation.objects.prefetch_related("items").order_by("-created_at"))
    ).order_by("-created_at")


def get_enquiry(*, enquiry_id: uuid.UUID) -> Enquiry | None:
    return list_enquiries().filter(pk=enquiry_id).first()


def list_banks() -> QuerySet[BankAccount]:
    """Bank accounts for the dealer."""
    return BankAccount.objects.filter(is_active=True).order_by("-is_default")


def list_products() -> QuerySet[ProductCatalog]:
    """Product catalog (presets) for the dealer."""
    return ProductCatalog.objects.filter(is_active=True)
