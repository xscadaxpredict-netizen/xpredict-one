from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from core.api import TenantAPIView

from .. import selectors, services
from .serializers import (
    EnquiryCreateSerializer,
    EnquiryReadSerializer,
    EnquiryUpdateSerializer,
    FollowupCreateSerializer,
    QuotationCreateSerializer,
    BankAccountReadSerializer,
    ProductPresetReadSerializer,
    BankAccountWriteSerializer,
    ProductCatalogWriteSerializer,
)


class EnquiryListCreateView(TenantAPIView):
    required_permissions = ["dms.enquiry.view"]
    method_permissions = {"POST": ["dms.enquiry.create"]}

    def get(self, request: Request, org_slug: str) -> Response:
        enquiries = selectors.list_enquiries(
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
        )
        return Response(EnquiryReadSerializer(enquiries, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = EnquiryCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        enquiry = services.create_enquiry(
            unit_id=request.unit_id,  # type: ignore
            created_by_user_id=request.user.id,
            **payload.validated_data,
        )
        # Re-fetch for full nested serialization
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data, status=status.HTTP_201_CREATED)


def _get_enquiry_or_404(view: TenantAPIView, request: Request, pk: str):
    enquiry = selectors.get_enquiry(
        enquiry_id=pk,
        actor_user_id=request.user.id,
        is_manager_or_admin=view.is_manager_or_admin,
    )
    if not enquiry:
        from rest_framework.exceptions import NotFound
        raise NotFound("Enquiry not found or access denied.")
    return enquiry


class EnquiryDetailView(TenantAPIView):
    required_permissions = ["dms.enquiry.view"]
    method_permissions = {
        "PATCH": ["dms.enquiry.update"],
        "DELETE": ["dms.enquiry.close"],
    }

    def get(self, request: Request, org_slug: str, pk: str) -> Response:
        enquiry = _get_enquiry_or_404(self, request, pk)
        return Response(EnquiryReadSerializer(enquiry).data)

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        payload = EnquiryUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        enquiry = services.update_enquiry(
            enquiry_id=pk,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        services.delete_enquiry(enquiry_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnquiryFollowupCreateView(TenantAPIView):
    required_permissions = ["dms.enquiry.update"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        payload = FollowupCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        enquiry = services.add_followup(
            enquiry_id=pk,
            unit_id=request.unit_id,  # type: ignore
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data, status=status.HTTP_201_CREATED)


class EnquiryFollowupDetailView(TenantAPIView):
    required_permissions = ["dms.enquiry.update"]

    def patch(self, request: Request, org_slug: str, pk: str, followup_id: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        payload = FollowupCreateSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        enquiry = services.update_followup(
            enquiry_id=pk,
            followup_id=followup_id,
            **payload.validated_data
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str, followup_id: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        enquiry = services.delete_followup(
            enquiry_id=pk,
            followup_id=followup_id
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class EnquiryQuotationListCreateView(TenantAPIView):
    required_permissions = ["dms.quotation.view"]
    method_permissions = {"POST": ["dms.quotation.create"]}

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        payload = QuotationCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        
        # Check if updating existing quote (frontend sends PUT logic as POST or separate endpoint)
        # We handle it via query param or dedicated PUT, but frontend passes existingQuoteId.
        existing_quote_id = request.query_params.get("quote_id")
        
        enquiry = services.save_quotation(
            enquiry_id=pk,
            unit_id=request.unit_id,  # type: ignore
            actor_user_id=request.user.id,
            quote_data=payload.validated_data,
            existing_quote_id=existing_quote_id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data, status=status.HTTP_200_OK if existing_quote_id else status.HTTP_201_CREATED)


class EnquiryQuotationDetailView(TenantAPIView):
    required_permissions = ["dms.quotation.view"]
    method_permissions = {"DELETE": ["dms.quotation.approve"]}

    def delete(self, request: Request, org_slug: str, pk: str, quote_id: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        enquiry = services.delete_quotation(
            enquiry_id=pk,
            quote_id=quote_id,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class EnquiryConfirmView(TenantAPIView):
    required_permissions = ["dms.order.confirm"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        quote_id = request.data.get("quote_id")
        enquiry = services.confirm_order(
            enquiry_id=pk,
            quote_id=quote_id,
            unit_id=request.unit_id,  # type: ignore
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class EnquiryUnconfirmView(TenantAPIView):
    required_permissions = ["dms.order.confirm"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        enquiry = services.unconfirm_order(
            enquiry_id=pk,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class BankAccountListView(TenantAPIView):
    required_permissions = ["dms.enquiry.view"]
    method_permissions = {"POST": ["dms.order.confirm"]}

    def get(self, request: Request, org_slug: str) -> Response:
        banks = selectors.list_banks()
        return Response(BankAccountReadSerializer(banks, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = BankAccountWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        bank = services.create_bank_account(
            unit_id=request.unit_id,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(BankAccountReadSerializer(bank).data, status=status.HTTP_201_CREATED)


class BankAccountDetailView(TenantAPIView):
    required_permissions = ["dms.order.confirm"]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = BankAccountWriteSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        bank = services.update_bank_account(
            bank_id=pk,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(BankAccountReadSerializer(bank).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_bank_account(bank_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductPresetListView(TenantAPIView):
    required_permissions = ["dms.enquiry.view"]
    method_permissions = {"POST": ["dms.order.confirm"]}

    def get(self, request: Request, org_slug: str) -> Response:
        products = selectors.list_products()
        return Response(ProductPresetReadSerializer(products, many=True, context={'request': request}).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = ProductCatalogWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        product = services.create_product_catalog(
            unit_id=request.unit_id,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(ProductPresetReadSerializer(product, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductPresetDetailView(TenantAPIView):
    required_permissions = ["dms.order.confirm"]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = ProductCatalogWriteSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        product = services.update_product_catalog(
            product_id=pk,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(ProductPresetReadSerializer(product, context={'request': request}).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_product_catalog(product_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnquiryConfirmAmcView(TenantAPIView):
    required_permissions = ["dms.order.confirm"]

    def post(self, request: Request, org_slug: str, pk: str, quote_id: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        enquiry = services.confirm_amc_quote(
            enquiry_id=pk,
            quote_id=quote_id,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)
