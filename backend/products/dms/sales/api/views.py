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
    def get(self, request: Request, org_slug: str) -> Response:
        enquiries = selectors.list_enquiries()
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


class EnquiryDetailView(TenantAPIView):
    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = EnquiryUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        enquiry = services.update_enquiry(
            enquiry_id=pk,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_enquiry(enquiry_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnquiryFollowupCreateView(TenantAPIView):
    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = FollowupCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        enquiry = services.add_followup(
            enquiry_id=pk,
            unit_id=request.unit_id,  # type: ignore
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data, status=status.HTTP_201_CREATED)


class EnquiryFollowupDetailView(TenantAPIView):
    def patch(self, request: Request, org_slug: str, pk: str, followup_id: str) -> Response:
        payload = FollowupCreateSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        enquiry = services.update_followup(
            enquiry_id=pk,
            followup_id=followup_id,
            **payload.validated_data
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str, followup_id: str) -> Response:
        enquiry = services.delete_followup(
            enquiry_id=pk,
            followup_id=followup_id
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class EnquiryQuotationListCreateView(TenantAPIView):
    def post(self, request: Request, org_slug: str, pk: str) -> Response:
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
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data, status=status.HTTP_200_OK if existing_quote_id else status.HTTP_201_CREATED)


class EnquiryQuotationDetailView(TenantAPIView):
    def delete(self, request: Request, org_slug: str, pk: str, quote_id: str) -> Response:
        enquiry = services.delete_quotation(
            enquiry_id=pk,
            quote_id=quote_id,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class EnquiryConfirmView(TenantAPIView):
    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        quote_id = request.data.get("quote_id")
        enquiry = services.confirm_order(
            enquiry_id=pk,
            quote_id=quote_id,
            unit_id=request.unit_id,  # type: ignore
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class EnquiryUnconfirmView(TenantAPIView):
    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        enquiry = services.unconfirm_order(
            enquiry_id=pk,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class BankAccountListView(TenantAPIView):
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
    def post(self, request: Request, org_slug: str, pk: str, quote_id: str) -> Response:
        enquiry = services.confirm_amc_quote(
            enquiry_id=pk,
            quote_id=quote_id,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)
