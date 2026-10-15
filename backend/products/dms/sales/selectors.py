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

from django.db.models import Prefetch, Q

from .models import Enquiry, BankAccount, ProductCatalog, Quotation, Followup

if TYPE_CHECKING:
    from django.db.models import QuerySet


def list_enquiries(
    *,
    actor_user_id: uuid.UUID | None = None,
    is_manager_or_admin: bool = True,
) -> QuerySet[Enquiry]:
    """
    Enquiries the caller may see, newest first. Already dealer-scoped by UnitScopedModel.
    If the caller is not a manager or admin, only their own assigned or created
    enquiries are returned (peers cannot see each other's deals).
    """
    qs = Enquiry.objects.prefetch_related(
        Prefetch("followups", queryset=Followup.objects.order_by("-created_at")),
        Prefetch("quotations", queryset=Quotation.objects.prefetch_related("items").order_by("-created_at"))
    )
    if not is_manager_or_admin and actor_user_id:
        qs = qs.filter(Q(created_by_user_id=actor_user_id) | Q(assigned_to_user_id=actor_user_id))
    return qs.order_by("-created_at")


def get_enquiry(
    *,
    enquiry_id: uuid.UUID | str,
    actor_user_id: uuid.UUID | None = None,
    is_manager_or_admin: bool = False,
) -> Enquiry | None:
    return list_enquiries(
        actor_user_id=actor_user_id,
        is_manager_or_admin=is_manager_or_admin,
    ).filter(pk=enquiry_id).first()


def list_banks() -> QuerySet[BankAccount]:
    """Bank accounts for the dealer."""
    return BankAccount.objects.filter(is_active=True).order_by("-is_default")


def list_products() -> QuerySet[ProductCatalog]:
    """Product catalog (presets) for the dealer."""
    return ProductCatalog.objects.filter(is_active=True)
