"""
Serializers for Sales: shape and field-level validation only.

No business rules here. A serializer validates that a phone number looks like a
phone number; whether this actor may create an enquiry for this dealer is a
service concern, checked where the rule lives.
"""

from __future__ import annotations

from rest_framework import serializers

from ..models import Enquiry, Followup, Quotation, QuotationItem, BankAccount, ProductCatalog


# ---- Read Serializers (Outgoing) --------------------------------------------

class FollowupReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Followup
        fields = ["id", "remarks", "next_followup_date", "created_at"]
        read_only_fields = fields


class QuotationItemReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuotationItem
        fields = [
            "id",
            "product_id",
            "description",
            "hsn_code",
            "locked_base_price",
            "locked_margin",
            "locked_gst_rate",
            "quantity",
        ]
        read_only_fields = fields


class QuotationReadSerializer(serializers.ModelSerializer):
    items = QuotationItemReadSerializer(many=True)
    from_details = serializers.SerializerMethodField()
    to_details = serializers.SerializerMethodField()
    selected_bank_id = serializers.CharField(source="bank_account_id")

    class Meta:
        model = Quotation
        fields = [
            "id",
            "title",
            "quote_no",
            "quote_type",
            "amc_type",
            "service_interval",
            "status",
            "from_details",
            "to_details",
            "selected_bank_id",
            "items",
            "terms",
            "created_at",
        ]
        read_only_fields = fields

    def get_from_details(self, obj: Quotation) -> dict:
        return {
            "company_name": obj.from_company_name,
            "contact_person": obj.from_contact_person,
            "phone": obj.from_phone,
            "email": obj.from_email,
            "address": obj.from_address,
            "state": obj.from_state,
            "gst": obj.from_gst,
            "pan": obj.from_pan,
        }

    def get_to_details(self, obj: Quotation) -> dict:
        return {
            "company_name": obj.to_company_name,
            "contact_person": obj.to_contact_person,
            "phone": obj.to_phone,
            "email": obj.to_email,
            "address": obj.to_address,
            "state": obj.to_state,
            "gst": obj.to_gst,
            "pan": obj.to_pan,
        }


class EnquiryReadSerializer(serializers.ModelSerializer):
    followups = FollowupReadSerializer(many=True, read_only=True)
    quotes = QuotationReadSerializer(many=True, read_only=True, source="quotations")

    class Meta:
        model = Enquiry
        fields = [
            "id",
            "customer_name",
            "contact_person",
            "address",
            "pincode",
            "phone",
            "remarks",
            "status",
            "confirmed_quote_id",
            "oc_number",
            "followups",
            "quotes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class BankAccountReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ["id", "bank_name", "account_no", "ifsc_code"]
        read_only_fields = fields


class ProductPresetReadSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="product_type")
    hsn = serializers.CharField(source="hsn_code")
    margin = serializers.DecimalField(source="margin_percent", max_digits=5, decimal_places=2)

    class Meta:
        model = ProductCatalog
        fields = [
            "id",
            "type",
            "description",
            "hsn",
            "base_price",
            "margin",
            "gst_rate",
        ]
        read_only_fields = fields


# ---- Write Serializers (Incoming) -------------------------------------------

class EnquiryCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=255)
    contact_person = serializers.CharField(max_length=255, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    pincode = serializers.CharField(max_length=10, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    remarks = serializers.CharField(required=False, allow_blank=True)
    followup_remarks = serializers.CharField()
    followup_next_date = serializers.DateField()


class EnquiryUpdateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=255, required=False)
    contact_person = serializers.CharField(max_length=255, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    pincode = serializers.CharField(max_length=10, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    remarks = serializers.CharField(required=False, allow_blank=True)


class FollowupCreateSerializer(serializers.Serializer):
    remarks = serializers.CharField()
    next_followup_date = serializers.DateField()


class AddressDetailsSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    contact_person = serializers.CharField(max_length=255, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    gst = serializers.CharField(max_length=20, required=False, allow_blank=True)
    pan = serializers.CharField(max_length=15, required=False, allow_blank=True)


class QuotationItemCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(max_length=500)
    hsn = serializers.CharField(max_length=20, required=False, allow_blank=True)
    base_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    margin = serializers.DecimalField(max_digits=5, decimal_places=2)
    gst_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    quantity = serializers.IntegerField(min_value=1)


class QuotationCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    quote_no = serializers.CharField(max_length=50)
    type = serializers.CharField(max_length=10)
    amc_type = serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True)
    service_interval = serializers.CharField(max_length=50, required=False, allow_null=True, allow_blank=True)
    status = serializers.CharField(max_length=20)
    from_details = AddressDetailsSerializer()
    to_details = AddressDetailsSerializer()
    selected_bank_id = serializers.UUIDField()
    terms = serializers.CharField(required=False, allow_blank=True)
    items = QuotationItemCreateSerializer(many=True)
