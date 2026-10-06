"""
Sales-specific failures.

Modules subclass the shared categories rather than inventing their own base:
the category decides the status code, and the `code` is what the frontend
switches on. A new exception here needs no change to the handler.

Keep these named after the *business* situation, not the HTTP outcome ---
`EnquiryAlreadyClosedError`, not `EnquiryConflict`. The category already carries the
outcome; the name should say what actually happened.
"""

from __future__ import annotations

from shared.exceptions import ConflictError, InvalidInputError


class EnquiryAlreadyClosedError(ConflictError):
    """Raised when an already-won or already-lost enquiry is acted on."""

    code = "enquiry_already_closed"
    message = "This enquiry is closed and cannot be modified."


class EnquiryNotAssignableError(ConflictError):
    """The chosen assignee has no active membership at the enquiry's dealer."""

    code = "enquiry_not_assignable"
    message = "That person cannot be assigned work at this dealer."


class DiscountExceedsLimitError(InvalidInputError):
    """A dealer-level discount above the limit the organization set."""

    code = "discount_exceeds_limit"
    message = "The discount exceeds this dealer's limit."
