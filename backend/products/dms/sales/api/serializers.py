"""
Serializers for Sales: shape and field-level validation only.

No business rules here. A serializer validates that a phone number looks like a
phone number; whether this actor may create an enquiry for this dealer is a
service concern, checked where the rule lives.
"""

from __future__ import annotations

from rest_framework import serializers

from ..models import Enquiry


class EnquiryReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enquiry
        fields = [
            "id",
            "reference",
            "status",
            "source",
            "customer_name",
            "customer_phone",
            "customer_email",
            "assigned_to_user_id",
            "unit_id",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class EnquiryCreateSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=Enquiry.Source.choices)
    customer_name = serializers.CharField(max_length=200)
    customer_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    customer_email = serializers.EmailField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
