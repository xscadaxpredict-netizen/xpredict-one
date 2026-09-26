"""
Domain exception taxonomy.

These are deliberately **framework-agnostic**: nothing here imports DRF or
knows about status codes. A service must be callable from an HTTP view, a
Celery task, a management command and a test, so it cannot raise an exception
that only means something over HTTP. The translation to a status code happens
in exactly one place --- `config.exception_handler`.

Six categories, and the boundaries between them are what matter:

| Category                | HTTP | Means                                            |
|-------------------------|------|--------------------------------------------------|
| `InvalidInputError`     | 422  | Input is malformed or breaks a field rule        |
| `NotFoundError`         | 404  | Absent --- **or present but not the caller's**    |
| `AuthorizationError`    | 403  | Caller can see it, but may not do this to it     |
| `ConflictError`         | 409  | Well-formed, but not allowed in the current state|
| `ExternalServiceError`  | 502  | A dependency we do not control failed            |
| anything else           | 500  | A bug. Never caught, never prettified.           |

**The 404-vs-403 line is a security boundary, not a style choice.**
Another dealer's record must be indistinguishable from one that never existed
(C3), so cross-scope access raises `NotFoundError`. `AuthorizationError` is
only for a record the caller is entitled to see but not to act on this way.
Getting this backwards leaks which dealers exist and how many records they hold.

In practice the default manager already produces the right answer: a
`UnitScopedModel` query for another dealer's row returns nothing, so the
selector returns None and the service raises `NotFoundError` without anyone
making a judgement call.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FieldError:
    """One field-level problem, for forms to render next to the input."""

    field: str
    code: str
    detail: str


class DomainError(Exception):
    """
    Base for every expected failure.

    `code` is a stable, machine-readable identifier. The frontend switches on
    it and localises its own message --- so `detail` is for humans reading logs
    and developers, and changing its wording must never break a client.

    `context` carries structured data for logging. It is **not** serialised
    into the response: it routinely holds IDs and internal state that the
    caller has no business seeing.
    """

    code: str = "domain_error"
    message: str = "The request could not be completed."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        field_errors: list[FieldError] | None = None,
        **context: Any,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.field_errors = field_errors or []
        self.context = context
        super().__init__(self.message)

    def __str__(self) -> str:
        return self.message


class InvalidInputError(DomainError):
    """
    Input is malformed, or breaks a rule a serializer cannot see.

    Serializers handle shape --- is this a valid email, is this field required.
    This is for invariants that need the database or other records to check:
    "this discount exceeds the dealer's limit", "this vehicle is already sold".
    """

    code = "validation_failed"
    message = "The submitted data is not valid."


class NotFoundError(DomainError):
    """
    The record does not exist, or does not exist **for this caller**.

    Both cases raise this, on purpose. Never add a message that distinguishes
    them: "you do not have access to enquiry ENQ-00123" confirms ENQ-00123
    exists and belongs to someone, which is exactly the leak 404-not-403
    prevents.
    """

    code = "not_found"
    message = "Not found."


class AuthorizationError(DomainError):
    """
    The caller may see this record but may not perform this action on it.

    Only for entitled-but-not-permitted --- a dealer admin trying to assign an
    org-level role, say. Cross-scope access is `NotFoundError`.

    Named `AuthorizationError` rather than `PermissionError`, which is a Python
    builtin and would shadow it.
    """

    code = "not_permitted"
    message = "You do not have permission to perform this action."


class ConflictError(DomainError):
    """
    The request is well-formed but the current state does not allow it.

    Invalid state transitions ("cannot confirm a cancelled order"), duplicates,
    and lost optimistic-lock races. This is the category most business rules
    fall into, and the one most often mislabelled as validation --- the
    difference is that validation failures are about the *input*, and these are
    about the *world*. Resubmitting the same input later might succeed.
    """

    code = "conflict"
    message = "This action conflicts with the current state."


class ExternalServiceError(DomainError):
    """
    Something we do not control failed: a payment gateway, SMS provider, S3.

    Distinct from a bug because the caller may reasonably retry, and because
    the fix is usually operational rather than a code change. Never surface the
    upstream's raw error --- it may carry credentials or internal hostnames.
    """

    code = "external_service_error"
    message = "An upstream service is unavailable. Please try again."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def not_found(resource: str = "Resource") -> NotFoundError:
    """
    Build a `NotFoundError` with a message that cannot leak.

    `resource` names a *type*, never an instance: "Enquiry", not "ENQ-00123".
    """
    return NotFoundError(f"{resource} not found.", resource=resource)


@dataclass
class ErrorAccumulator:
    """
    Collect several field errors before raising, so a form reports everything
    at once instead of one problem per round trip.

        errors = ErrorAccumulator()
        if discount > limit:
            errors.add("discount", "exceeds_limit", "Above this dealer's limit.")
        if not vehicle.is_available:
            errors.add("vehicle_id", "unavailable", "Already sold.")
        errors.raise_if_any()
    """

    items: list[FieldError] = field(default_factory=list)

    def add(self, field_name: str, code: str, detail: str) -> None:
        self.items.append(FieldError(field=field_name, code=code, detail=detail))

    def raise_if_any(self, message: str = "The submitted data is not valid.") -> None:
        if self.items:
            raise InvalidInputError(message, field_errors=self.items)
