from typing import ClassVar

from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from core.api import TenantAPIView

from .. import selectors, services
from .serializers import (
    BankAccountReadSerializer,
    BankAccountWriteSerializer,
    EnquiryCreateSerializer,
    EnquiryReadSerializer,
    EnquiryUpdateSerializer,
    FollowupCreateSerializer,
    ProductCatalogWriteSerializer,
    ProductPresetReadSerializer,
    QuotationCreateSerializer,
    TechnoCommercialDocumentReadSerializer,
    TechnoCommercialDocumentWriteSerializer,
)


class EnquiryListCreateView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.enquiry.create"]}

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
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
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
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.update"]

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
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.update"]

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
    required_permissions: ClassVar[list[str]] = ["dms.quotation.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.quotation.create"]}

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
        return Response(
            EnquiryReadSerializer(enquiry_fetched).data,
            status=status.HTTP_200_OK if existing_quote_id else status.HTTP_201_CREATED,
        )


class EnquiryQuotationDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.quotation.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"DELETE": ["dms.quotation.approve"]}

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
    required_permissions: ClassVar[list[str]] = ["dms.order.confirm"]

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
    required_permissions: ClassVar[list[str]] = ["dms.order.confirm"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        enquiry = services.unconfirm_order(
            enquiry_id=pk,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class BankAccountListView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.order.confirm"]}

    def get(self, request: Request, org_slug: str) -> Response:
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        unit_id_param = request.query_params.get("unit_id")
        banks = selectors.list_banks(is_org_admin=is_org_admin, unit_id=unit_id_param)
        return Response(BankAccountReadSerializer(banks, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = BankAccountWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        unit_id = None if is_org_admin else request.unit_id
        bank = services.create_bank_account(
            unit_id=unit_id,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(BankAccountReadSerializer(bank).data, status=status.HTTP_201_CREATED)


class BankAccountDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.order.confirm"]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = BankAccountWriteSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        bank = services.update_bank_account(
            bank_id=pk,
            actor_user_id=request.user.id,
            request_unit_id=request.unit_id,
            is_org_admin=is_org_admin,
            **payload.validated_data,
        )
        return Response(BankAccountReadSerializer(bank).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        services.delete_bank_account(
            bank_id=pk,
            request_unit_id=request.unit_id,
            is_org_admin=is_org_admin,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductPresetListView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.order.confirm"]}

    def get(self, request: Request, org_slug: str) -> Response:
        products = selectors.list_products()
        return Response(
            ProductPresetReadSerializer(products, many=True, context={"request": request}).data
        )

    def post(self, request: Request, org_slug: str) -> Response:
        payload = ProductCatalogWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        is_global_param = payload.validated_data.pop("is_global", None)

        if is_org_admin:
            # Org owner/admin creates Global OEM item unless explicitly told otherwise
            unit_id = None if is_global_param is not False else request.unit_id
        else:
            # Dealer user always creates a dealer item
            unit_id = request.unit_id

        product = services.create_product_catalog(
            unit_id=unit_id,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(
            ProductPresetReadSerializer(product, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProductPresetDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.order.confirm"]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = ProductCatalogWriteSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        product = services.update_product_catalog(
            product_id=pk,
            actor_user_id=request.user.id,
            request_unit_id=request.unit_id,
            is_org_admin=is_org_admin,
            **payload.validated_data,
        )
        return Response(ProductPresetReadSerializer(product, context={"request": request}).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        services.delete_product_catalog(
            product_id=pk,
            request_unit_id=request.unit_id,
            is_org_admin=is_org_admin,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnquiryConfirmAmcView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.order.confirm"]

    def post(self, request: Request, org_slug: str, pk: str, quote_id: str) -> Response:
        _get_enquiry_or_404(self, request, pk)
        enquiry = services.confirm_amc_quote(
            enquiry_id=pk,
            quote_id=quote_id,
            actor_user_id=request.user.id,
        )
        enquiry_fetched = selectors.get_enquiry(enquiry_id=enquiry.id, is_manager_or_admin=True)
        return Response(EnquiryReadSerializer(enquiry_fetched).data)


class TechnoCommercialDocumentListCreateView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.quotation.create"]}
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, org_slug: str) -> Response:
        search = request.query_params.get("search")
        documents = selectors.list_techno_commercial_documents(
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
            search=search,
        )
        return Response(TechnoCommercialDocumentReadSerializer(documents, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = TechnoCommercialDocumentWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        file = request.FILES.get("file") or payload.validated_data.get("file")
        if not file:
            return Response(
                {"file": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST
            )

        doc = services.create_techno_commercial_document(
            unit_id=request.unit_id,
            created_by_user_id=request.user.id,
            file=file,
            title=payload.validated_data["title"],
            notes=payload.validated_data.get("notes", ""),
            site_id=payload.validated_data.get("site"),
            site_name=payload.validated_data.get("site_name", ""),
            quotation_id=payload.validated_data.get("quotation"),
            quote_number=payload.validated_data.get("quote_number", ""),
        )
        doc_fetched = selectors.get_techno_commercial_document(
            document_id=doc.id,
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
        )
        return Response(
            TechnoCommercialDocumentReadSerializer(doc_fetched).data, status=status.HTTP_201_CREATED
        )


class TechnoCommercialDocumentDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PATCH": ["dms.quotation.update"],
        "DELETE": ["dms.quotation.update"],
    }
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, org_slug: str, pk: str) -> Response:
        doc = selectors.get_techno_commercial_document(
            document_id=pk,
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
        )
        if not doc:
            raise NotFound("Techno-commercial document not found.")
        return Response(TechnoCommercialDocumentReadSerializer(doc).data)

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = TechnoCommercialDocumentWriteSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)

        file = request.FILES.get("file")
        updates = {**payload.validated_data}
        if file:
            updates["file"] = file
        if "site" in updates:
            updates["site_id"] = updates.pop("site")
        if "quotation" in updates:
            updates["quotation_id"] = updates.pop("quotation")

        doc = services.update_techno_commercial_document(
            document_id=pk,
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
            **updates,
        )
        doc_fetched = selectors.get_techno_commercial_document(
            document_id=doc.id,
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
        )
        return Response(TechnoCommercialDocumentReadSerializer(doc_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        if not self.is_manager_or_admin:
            raise PermissionDenied(
                "Only sales managers or dealership administrators can delete "
                "techno-commercial documents."
            )
        services.delete_techno_commercial_document(
            document_id=pk,
            actor_user_id=request.user.id,
            is_manager_or_admin=self.is_manager_or_admin,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentDealerProfileView(TenantAPIView):
    """
    Returns the current business unit (dealership) profile for the requesting user,
    or organization fallback if the user is org-scoped.
    """

    required_permissions: ClassVar[list[str]] = ["dms.enquiry.view"]

    def get(self, request: Request, org_slug: str) -> Response:
        from core.organizations.models import BusinessUnit

        unit_id = request.unit_id
        if unit_id:
            unit = BusinessUnit.objects.using("default").filter(id=unit_id).first()
            if unit:
                address_parts = [p for p in [unit.city, unit.state, unit.postal_code] if p]
                return Response(
                    {
                        "id": str(unit.id),
                        "company_name": unit.name,
                        "address": ", ".join(address_parts),
                        "city": unit.city or "",
                        "state": unit.state or "",
                        "postal_code": unit.postal_code or "",
                        "contact_person": unit.contact_person or "",
                        "email": unit.email or "",
                        "phone": unit.phone or "",
                        "gstin": unit.gstin or "",
                        "pan": unit.pan or "",
                        "is_dealer": True,
                    }
                )

        return Response(
            {
                "id": None,
                "company_name": self.organization.name,
                "address": "",
                "city": "",
                "state": "",
                "postal_code": "",
                "contact_person": "",
                "email": "",
                "phone": "",
                "gstin": "",
                "pan": "",
                "is_dealer": False,
            }
        )


class AgentCommissionListView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.quotation.view"]

    def get(self, request: Request, org_slug: str) -> Response:
        is_org_admin = bool(
            self.membership.role in ("owner", "admin") and self.membership.unit_id is None
        )
        commissions = selectors.list_agent_commissions(
            unit_id=request.unit_id,
            is_org_admin=is_org_admin,
        )
        return Response(commissions)


class RecordCommissionPaymentView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.order.confirm"]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def post(self, request: Request, org_slug: str) -> Response:
        comm_type = request.data.get("type", "COMMISSION")
        reference_id = request.data.get("reference_id")
        payment_ref = request.data.get("payment_ref", "").strip()
        amount_raw = request.data.get("amount")
        amount = (
            float(amount_raw) if amount_raw is not None and str(amount_raw).strip() != "" else None
        )
        paid_at = request.data.get("paid_at") or None
        notes = request.data.get("notes", "").strip()
        proof_files = request.FILES.getlist("proofs") or request.FILES.getlist("proof_files") or []

        if not reference_id:
            return Response(
                {"error": "reference_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        if not payment_ref:
            return Response(
                {"error": "Payment reference / UTR is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if comm_type == "LEAD_FEE":
            enquiry = services.record_lead_fee_payment(
                enquiry_id=reference_id,
                payment_ref=payment_ref,
                actor_user_id=request.user.id,
                unit_id=request.unit_id,
                amount=amount,
                paid_at=paid_at,
                notes=notes,
                proof_files=proof_files,
            )
            return Response(
                {
                    "status": enquiry.lead_fee_status,
                    "payment_ref": payment_ref,
                    "paid_amount": enquiry.total_lead_fee_paid,
                    "balance_amount": enquiry.lead_fee_balance,
                }
            )
        else:
            quote = services.record_commission_payment(
                quote_id=reference_id,
                payment_ref=payment_ref,
                actor_user_id=request.user.id,
                unit_id=request.unit_id,
                amount=amount,
                paid_at=paid_at,
                notes=notes,
                proof_files=proof_files,
            )
            return Response(
                {
                    "status": quote.commission_status,
                    "payment_ref": payment_ref,
                    "paid_amount": quote.total_commission_paid,
                    "balance_amount": quote.commission_balance,
                }
            )
