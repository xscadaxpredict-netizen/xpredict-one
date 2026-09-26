"""
HTTP layer for Sales. Thin by design.

A view does four things and nothing else: check permission, deserialize, call a
service or selector, serialize the result. If a view contains an `if` about
business rules, that rule is in the wrong place --- move it into services.py,
where a Celery task and a management command can reach it too.

One user action = one endpoint = one transaction (the service supplies the
transaction).
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import selectors, services
from .serializers import EnquiryCreateSerializer, EnquiryReadSerializer


class EnquiryListCreateView(APIView):
    def get(self, request: Request, org_slug: str) -> Response:
        enquiries = selectors.list_enquiries(status=request.query_params.get("status"))
        return Response(EnquiryReadSerializer(enquiries, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = EnquiryCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        # No try/except. A domain exception raised below travels to
        # config.exception_handler, which turns it into RFC 9457 problem+json
        # with the right status. Catching it here would duplicate that mapping
        # and drift from it.
        enquiry = services.create_enquiry(
            # The dealer comes from the caller's membership, resolved by the
            # tenant middleware --- never from the request body, which the
            # client controls.
            unit_id=request.membership.unit_id,  # type: ignore[attr-defined]
            created_by_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(
            EnquiryReadSerializer(enquiry).data,
            status=status.HTTP_201_CREATED,
        )
