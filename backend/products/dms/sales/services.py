"""
Write logic for Sales.

Every state change goes through a function here --- never through a view, a
serializer, or another module reaching in. This module owns `Enquiry`, so this
is the only place that can enforce its numbering, validation, audit and events
consistently.

Calling into other modules:

- Same product: call the other module's service function.
  `from products.dms.service.services import open_job_card` --- never
  `JobCard.objects.create(...)`. The owning module enforces its own rules.
- Different product (CRM, E-commerce): publish an event, or call a small public
  service interface. Never import another product's models.

One user action = one public function here = one transaction.
"""

from __future__ import annotations

import uuid

from django.db import transaction

from shared.exceptions import ErrorAccumulator, not_found

from .exceptions import EnquiryAlreadyClosedError
from .models import Enquiry


@transaction.atomic
def create_enquiry(
    *,
    unit_id: uuid.UUID,
    source: str,
    customer_name: str,
    created_by_user_id: uuid.UUID,
    customer_phone: str = "",
    customer_email: str = "",
    notes: str = "",
) -> Enquiry:
    """
    Record a new enquiry for a dealer.

    `unit_id` is passed explicitly rather than read from context: a service
    must be callable from a Celery task or a management command, where there
    is no request. The *caller* is responsible for checking the unit is one the
    actor may write to --- see the write-side validation note below.
    """
    # Write-side validation belongs here, not in the serializer. A record
    # referenced by this one (customer, vehicle, quote) must belong to an
    # allowed unit --- otherwise a caller can attach their enquiry to another
    # dealer's data by passing its ID.

    return Enquiry.objects.create(
        unit_id=unit_id,
        reference=_next_reference(unit_id),
        source=source,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        notes=notes,
        created_by_user_id=created_by_user_id,
    )


@transaction.atomic
def assign_enquiry(
    *,
    enquiry: Enquiry,
    assignee_user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Enquiry:
    """Assign an enquiry to a member of staff."""
    # The assignee must have a membership scoped to this enquiry's unit.
    # Checking that is a control-plane question --- ask core.permissions rather
    # than querying Membership directly from here.
    enquiry.assigned_to_user_id = assignee_user_id
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["assigned_to_user_id", "updated_by_user_id", "updated_at"])
    return enquiry


@transaction.atomic
def mark_enquiry_lost(*, enquiry: Enquiry, reason: str, actor_user_id: uuid.UUID) -> Enquiry:
    """
    Close an enquiry as lost.

    Shows the two error patterns:

    - A state rule raises a `ConflictError` subclass. The input is fine; the
      world does not allow it. The handler turns that into 409 automatically.
    - Several field problems are accumulated and raised together, so the form
      reports everything at once rather than one problem per round trip.

    A transition like this is also where an event belongs once the outbox
    exists (Phase 6): write the row and the outbox entry in this same
    transaction, so they cannot diverge.
    """
    if not enquiry.is_open:
        # Context is for the log, never the response --- it carries IDs the
        # caller may not be entitled to see.
        raise EnquiryAlreadyClosedError(
            enquiry_id=str(enquiry.id),
            current_status=enquiry.status,
        )

    errors = ErrorAccumulator()
    if not reason.strip():
        errors.add("reason", "required", "A reason is required when closing as lost.")
    errors.raise_if_any()

    enquiry.status = Enquiry.Status.LOST
    enquiry.notes = f"{enquiry.notes}\n[lost] {reason}".strip()
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["status", "notes", "updated_by_user_id", "updated_at"])
    return enquiry


@transaction.atomic
def reopen_enquiry(*, enquiry_id: uuid.UUID, actor_user_id: uuid.UUID) -> Enquiry:
    """
    Reopen a lost enquiry.

    Demonstrates the 404-not-403 rule, and why it needs no judgement call:
    `Enquiry.objects` is unit-scoped, so another dealer's enquiry is already
    filtered out and `.first()` returns None --- indistinguishable from an ID
    that never existed. Raising `not_found()` here is both the correct answer
    and the safe one.
    """
    enquiry = Enquiry.objects.filter(pk=enquiry_id).first()
    if enquiry is None:
        raise not_found("Enquiry")

    enquiry.status = Enquiry.Status.NEW
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["status", "updated_by_user_id", "updated_at"])
    return enquiry


def _next_reference(unit_id: uuid.UUID) -> str:
    """
    Allocate the next enquiry reference for a dealer.

    Sequence allocation must not race. Use a database sequence or
    `select_for_update` on a per-unit counter row --- never MAX(reference) + 1,
    which hands two concurrent callers the same number.
    """
    raise NotImplementedError("Numbering strategy is a Phase 5 decision.")
