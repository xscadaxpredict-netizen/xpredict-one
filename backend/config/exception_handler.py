"""
The one place exceptions become HTTP responses.

Every error leaves the API in the same shape --- RFC 9457 Problem Details
(`application/problem+json`), which supersedes RFC 7807. A client parses one
format regardless of whether the failure came from a serializer, a service,
the ORM or an unhandled bug:

    {
      "type":     "https://api.xpredict.one/errors/conflict",
      "title":    "Conflict",
      "status":   409,
      "detail":   "Enquiry is already closed.",
      "instance": "/api/v1/orgs/acme/dms/sales/enquiries/.../reopen",
      "code":     "enquiry_already_closed",
      "trace_id": "9f2c...",
      "errors":   [{"field": "discount", "code": "exceeds_limit", "detail": "..."}]
    }

`code` is the contract. The frontend switches on it and supplies its own
wording; `detail` is prose that may be reworded at any time.

`trace_id` is how support finds the real error in the logs without the response
having to carry it. Every 5xx logs the full exception against this id and
returns a deliberately uninformative body.

**Two rules this file exists to enforce:**

1. Views never catch domain exceptions. A view that try/excepts a service is
   duplicating logic that belongs here, and will drift.
2. A 5xx response never carries detail. Stack traces, SQL, constraint names and
   table names all disclose internals --- and in a multi-tenant system, may
   disclose another organization's data shape.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from django.core.exceptions import (
    ObjectDoesNotExist,
)
from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
)
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

from config.routers import TenantContextMissingError
from shared.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    DomainError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)

logger = logging.getLogger(__name__)

ERROR_TYPE_BASE = "https://api.xpredict.one/errors"

# Domain category -> HTTP status. The only mapping in the codebase.
_DOMAIN_STATUS: list[tuple[type[DomainError], int]] = [
    (InvalidInputError, status.HTTP_422_UNPROCESSABLE_ENTITY),
    (AuthenticationError, status.HTTP_401_UNAUTHORIZED),
    (NotFoundError, status.HTTP_404_NOT_FOUND),
    (AuthorizationError, status.HTTP_403_FORBIDDEN),
    (ConflictError, status.HTTP_409_CONFLICT),
    (ExternalServiceError, status.HTTP_502_BAD_GATEWAY),
]

_TITLES = {
    400: "Bad request",
    401: "Authentication required",
    403: "Forbidden",
    404: "Not found",
    405: "Method not allowed",
    409: "Conflict",
    422: "Unprocessable entity",
    429: "Too many requests",
    500: "Internal server error",
    502: "Bad gateway",
    503: "Service unavailable",
}


def _problem(
    *,
    status_code: int,
    code: str,
    detail: str,
    request: Any,
    trace_id: str,
    errors: list[dict[str, str]] | None = None,
) -> Response:
    body: dict[str, Any] = {
        "type": f"{ERROR_TYPE_BASE}/{code.replace('_', '-')}",
        "title": _TITLES.get(status_code, "Error"),
        "status": status_code,
        "detail": detail,
        "code": code,
        "trace_id": trace_id,
    }
    if request is not None and getattr(request, "path", None):
        body["instance"] = request.path
    if errors:
        body["errors"] = errors

    return Response(body, status=status_code, content_type="application/problem+json")


def _status_for(exc: DomainError) -> int:
    for exc_type, code in _DOMAIN_STATUS:
        if isinstance(exc, exc_type):
            return code
    return status.HTTP_400_BAD_REQUEST


def _flatten_drf_validation(detail: Any, prefix: str = "") -> list[dict[str, str]]:
    """Turn DRF's nested ValidationError detail into a flat field-error list."""
    out: list[dict[str, str]] = []
    if isinstance(detail, dict):
        for key, value in detail.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            out.extend(_flatten_drf_validation(value, path))
    elif isinstance(detail, list):
        for item in detail:
            if isinstance(item, dict | list):
                out.extend(_flatten_drf_validation(item, prefix))
            else:
                out.append(
                    {
                        "field": prefix or "non_field_errors",
                        "code": getattr(item, "code", "invalid"),
                        "detail": str(item),
                    }
                )
    else:
        out.append(
            {
                "field": prefix or "non_field_errors",
                "code": getattr(detail, "code", "invalid"),
                "detail": str(detail),
            }
        )
    return out


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """
    Wired in via REST_FRAMEWORK["EXCEPTION_HANDLER"].

    Order matters: the most specific category is checked first, and the
    catch-all 500 is last so a genuine bug is never silently reshaped into a
    friendly 4xx.
    """
    request = context.get("request")
    trace_id = uuid.uuid4().hex

    # ---- Our own domain exceptions -------------------------------------
    if isinstance(exc, DomainError):
        status_code = _status_for(exc)
        # 4xx are expected outcomes, not incidents: log at info so real
        # problems stay visible in the noise.
        logger.info(
            "domain_error",
            extra={
                "trace_id": trace_id,
                "code": exc.code,
                "status": status_code,
                "context": exc.context,
            },
        )
        return _problem(
            status_code=status_code,
            code=exc.code,
            detail=exc.message,
            request=request,
            trace_id=trace_id,
            errors=[
                {"field": fe.field, "code": fe.code, "detail": fe.detail} for fe in exc.field_errors
            ],
        )

    # ---- Tenant context missing ----------------------------------------
    # This is a BUG, not a user error. It means a tenant model was reached
    # without an organization bound --- a missing middleware, or a Celery task
    # that never set context from its org_id. Never soften it into a 404: that
    # would hide a routing fault that could otherwise expose the wrong database.
    if isinstance(exc, TenantContextMissingError):
        logger.critical(
            "tenant_context_missing",
            exc_info=exc,
            extra={"trace_id": trace_id, "path": getattr(request, "path", None)},
        )
        return _problem(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="internal_error",
            detail="An unexpected error occurred.",
            request=request,
            trace_id=trace_id,
        )

    # ---- Django exceptions that reach the API layer ---------------------
    if isinstance(exc, Http404 | ObjectDoesNotExist):
        return _problem(
            status_code=status.HTTP_404_NOT_FOUND,
            code="not_found",
            detail="Not found.",
            request=request,
            trace_id=trace_id,
        )

    if isinstance(exc, DjangoPermissionDenied):
        return _problem(
            status_code=status.HTTP_403_FORBIDDEN,
            code="not_permitted",
            detail="You do not have permission to perform this action.",
            request=request,
            trace_id=trace_id,
        )

    if isinstance(exc, DjangoValidationError):
        errors = [
            {"field": field_name, "code": "invalid", "detail": str(msg)}
            for field_name, messages in getattr(exc, "message_dict", {}).items()
            for msg in messages
        ]
        return _problem(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="validation_failed",
            detail="The submitted data is not valid.",
            request=request,
            trace_id=trace_id,
            errors=errors,
        )

    if isinstance(exc, IntegrityError):
        # A constraint fired that a service should have checked first. The
        # message names tables, columns and constraints, so it is logged and
        # never returned.
        logger.error("integrity_error", exc_info=exc, extra={"trace_id": trace_id})
        return _problem(
            status_code=status.HTTP_409_CONFLICT,
            code="conflict",
            detail="This action conflicts with the current state.",
            request=request,
            trace_id=trace_id,
        )

    # ---- DRF's own exceptions -------------------------------------------
    if isinstance(exc, drf_exceptions.ValidationError):
        return _problem(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="validation_failed",
            detail="The submitted data is not valid.",
            request=request,
            trace_id=trace_id,
            errors=_flatten_drf_validation(exc.detail),
        )

    if isinstance(exc, drf_exceptions.APIException):
        drf_response = drf_default_handler(exc, context)
        status_code = drf_response.status_code if drf_response is not None else exc.status_code
        return _problem(
            status_code=status_code,
            code=str(getattr(exc, "default_code", "error")),
            detail=str(exc.detail),
            request=request,
            trace_id=trace_id,
        )

    # ---- Anything else is a bug -----------------------------------------
    # Returning None would hand the exception back to Django, which in DEBUG
    # renders a traceback page containing settings and local variables. We
    # always answer with an opaque body and put the real error in the log.
    logger.exception(
        "unhandled_exception",
        extra={"trace_id": trace_id, "path": getattr(request, "path", None)},
    )
    return _problem(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="internal_error",
        detail="An unexpected error occurred.",
        request=request,
        trace_id=trace_id,
    )
