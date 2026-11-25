"""
Event handlers for Service.

Reacts to events published by other modules and products. Handlers must be
idempotent --- the dispatcher retries, so the same event will arrive twice.

Every event carries the org ID, and a handler sets tenant context from it
rather than assuming ambient context.
"""

from __future__ import annotations

from typing import Any

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from products.dms.sales.signals import amc_quote_unconfirmed

from .services import (
    cancel_scheduled_visits_for_unconfirmed_amc,
    cancel_upcoming_visits_for_amc_quote,
)


# The sender is named as a string, not imported: this module may not import
# dms_sales models (import-linter), and Django resolves the label lazily.
# Runs inside the delete's transaction, so a failed delete leaves the visits.
@receiver(
    pre_delete,
    sender="dms_sales.Quotation",
    dispatch_uid="site_services.cancel_visits_of_deleted_amc_quote",
)
def cancel_visits_of_deleted_amc_quote(sender: Any, instance: Any, **kwargs: Any) -> None:
    """
    An AMC quote is being deleted: cancel the visits it booked that have not
    happened yet. Visits already done stay as history (their FK goes NULL).
    Idempotent --- a second run finds nothing left to cancel.
    """
    if instance.quote_type == "AMC":
        cancel_upcoming_visits_for_amc_quote(quote_id=instance.id)


@receiver(amc_quote_unconfirmed, dispatch_uid="site_services.cancel_visits_of_unconfirmed_amc")
def cancel_visits_of_unconfirmed_amc(
    sender: Any, quote_id: Any, actor_user_id: Any = None, **kwargs: Any
) -> None:
    """An AMC was unconfirmed: cancel its scheduled visits, keeping them as history."""
    cancel_scheduled_visits_for_unconfirmed_amc(quote_id=quote_id, actor_user_id=actor_user_id)
