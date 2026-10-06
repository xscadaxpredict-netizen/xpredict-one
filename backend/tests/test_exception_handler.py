"""
Exception handling tests.

Most of these are security tests wearing an error-handling costume. The point
is not that a 404 is returned --- it is that a 404 is returned *instead of a
403*, and that a 500 discloses nothing.
"""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from django.test import RequestFactory
from rest_framework import exceptions as drf_exceptions

from config.exception_handler import api_exception_handler
from config.routers import TenantContextMissingError
from shared.exceptions import (
    AuthorizationError,
    ConflictError,
    ErrorAccumulator,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
    not_found,
)


@pytest.fixture
def ctx():
    request = RequestFactory().post("/api/v1/orgs/acme/dms/sales/enquiries/")
    return {"request": request, "view": None}


def handle(exc, ctx):
    response = api_exception_handler(exc, ctx)
    assert response is not None, (
        "The handler must never return None --- Django would render a traceback"
    )
    return response


# --------------------------------------------------------------------------
# Category -> status mapping
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("exc", "expected_status"),
    [
        (InvalidInputError(), 422),
        (NotFoundError(), 404),
        (AuthorizationError(), 403),
        (ConflictError(), 409),
        (ExternalServiceError(), 502),
    ],
)
def test_domain_categories_map_to_status(exc, expected_status, ctx):
    assert handle(exc, ctx).status_code == expected_status


def test_subclass_inherits_its_category_status(ctx):
    """A module's own exception needs no handler change."""

    class EnquiryAlreadyClosedError(ConflictError):
        code = "enquiry_already_closed"
        message = "This enquiry is closed."

    response = handle(EnquiryAlreadyClosedError(), ctx)
    assert response.status_code == 409
    assert response.data["code"] == "enquiry_already_closed"


# --------------------------------------------------------------------------
# Response shape (RFC 9457)
# --------------------------------------------------------------------------


def render(response):
    """
    Force the DRF render cycle.

    `Response.__init__` only stores the content type --- the header is written
    in `rendered_content`, which normally runs after `finalize_response`
    attaches a renderer. Asserting on the header without rendering tests
    nothing, so drive the real path.
    """
    from rest_framework.renderers import JSONRenderer

    response.accepted_renderer = JSONRenderer()
    response.accepted_media_type = "application/json"
    response.renderer_context = {}
    response.render()
    return response


def test_problem_details_shape(ctx):
    response = render(handle(ConflictError("Already closed."), ctx))

    # problem+json, not application/json: a client can tell an error body from
    # a success body by content type alone.
    assert response["Content-Type"] == "application/problem+json"
    for key in ("type", "title", "status", "detail", "code", "trace_id", "instance"):
        assert key in response.data, f"missing {key}"
    assert response.data["status"] == 409
    assert response.data["instance"] == "/api/v1/orgs/acme/dms/sales/enquiries/"


def test_every_response_carries_a_unique_trace_id(ctx):
    first = handle(ConflictError(), ctx).data["trace_id"]
    second = handle(ConflictError(), ctx).data["trace_id"]
    assert first and second and first != second


def test_field_errors_are_returned_together(ctx):
    """A form should report every problem at once, not one per round trip."""
    errors = ErrorAccumulator()
    errors.add("discount", "exceeds_limit", "Above this dealer's limit.")
    errors.add("vehicle_id", "unavailable", "Already sold.")

    with pytest.raises(InvalidInputError) as raised:
        errors.raise_if_any()

    response = handle(raised.value, ctx)
    assert response.status_code == 422
    assert {e["field"] for e in response.data["errors"]} == {"discount", "vehicle_id"}
    assert {e["code"] for e in response.data["errors"]} == {"exceeds_limit", "unavailable"}


# --------------------------------------------------------------------------
# Security properties
# --------------------------------------------------------------------------


def test_not_found_message_never_names_an_instance(ctx):
    """
    "Enquiry ENQ-123 not found" would confirm ENQ-123 exists somewhere.
    The helper takes a type name, and the message must stay generic.
    """
    response = handle(not_found("Enquiry"), ctx)
    assert response.status_code == 404
    assert response.data["detail"] == "Enquiry not found."


def test_domain_context_is_never_serialised(ctx):
    """
    `context` is for the log. It routinely holds IDs belonging to records the
    caller may not see, so it must not appear anywhere in the response body.
    """
    exc = ConflictError(
        "This enquiry is closed.",
        enquiry_id="11111111-1111-1111-1111-111111111111",
        owning_unit_id="22222222-2222-2222-2222-222222222222",
    )
    body = str(handle(exc, ctx).data)

    assert "11111111" not in body
    assert "22222222" not in body


def test_integrity_error_does_not_leak_schema(ctx):
    """
    A constraint message names tables, columns and constraint names. It is
    logged, never returned.
    """
    exc = IntegrityError(
        'duplicate key value violates unique constraint "dms_sales_enquiry_reference_key"\n'
        "DETAIL:  Key (reference)=(ENQ-00123) already exists."
    )
    response = handle(exc, ctx)
    body = str(response.data)

    assert response.status_code == 409
    assert "dms_sales_enquiry" not in body
    assert "ENQ-00123" not in body
    assert "constraint" not in body.lower()


def test_unhandled_exception_discloses_nothing(ctx):
    """A bug returns an opaque 500. The real error goes to the log."""
    response = handle(RuntimeError("connection string postgres://user:hunter2@db/acme"), ctx)

    assert response.status_code == 500
    assert response.data["detail"] == "An unexpected error occurred."
    assert "hunter2" not in str(response.data)
    assert response.data["trace_id"]


def test_missing_tenant_context_is_a_500_not_a_404(ctx):
    """
    Softening this into a 404 would hide a routing fault --- the one class of
    bug that could serve another organization's database. It must stay loud.
    """
    response = handle(TenantContextMissingError("no tenant bound"), ctx)

    assert response.status_code == 500
    assert "tenant" not in str(response.data).lower()


# --------------------------------------------------------------------------
# Framework exceptions are normalised into the same shape
# --------------------------------------------------------------------------


def test_http404_is_normalised(ctx):
    response = handle(Http404("gone"), ctx)
    assert response.status_code == 404
    assert response.data["code"] == "not_found"


def test_drf_validation_error_is_flattened(ctx):
    exc = drf_exceptions.ValidationError({"customer_email": ["Enter a valid email address."]})
    response = handle(exc, ctx)

    assert response.status_code == 422
    assert response.data["errors"][0]["field"] == "customer_email"


def test_nested_drf_validation_error_keeps_the_field_path(ctx):
    exc = drf_exceptions.ValidationError({"customer": {"email": ["Invalid."]}})
    response = handle(exc, ctx)

    assert response.data["errors"][0]["field"] == "customer.email"


def test_django_validation_error_is_normalised(ctx):
    exc = DjangoValidationError({"reference": ["Already taken."]})
    response = handle(exc, ctx)

    assert response.status_code == 422
    assert response.data["errors"][0]["field"] == "reference"


def test_drf_throttled_keeps_its_status(ctx):
    response = handle(drf_exceptions.Throttled(wait=30), ctx)
    assert response.status_code == 429


def test_drf_not_authenticated_is_401(ctx):
    response = handle(drf_exceptions.NotAuthenticated(), ctx)
    assert response.status_code == 401
