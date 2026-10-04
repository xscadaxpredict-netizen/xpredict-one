"""
Serializers for Site Services.
"""

from rest_framework import serializers

from products.dms.sales.api.serializers import QuotationReadSerializer
from products.dms.sales.models import ConfirmedSite
from ..models import (
    ServiceSchedule, ServiceReport, ReportAttachment,
    WaterReport, Complaint, SiteServiceProfile
)

# ---- Site & Profile ---------------------------------------------------------

class SiteServiceProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteServiceProfile
        fields = [
            "id",
            "dc_number",
            "service_type",
            "service_interval_days",
            "last_serviced_date",
            "technician_user_id",
            "technician_display_name",
            "notes",
        ]


class SiteReadSerializer(serializers.ModelSerializer):
    service_profile = SiteServiceProfileSerializer(read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    quotes = QuotationReadSerializer(many=True, read_only=True, source="quotations")
    enquiry_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ConfirmedSite
        fields = [
            "id",
            "enquiry_id",
            "customer_name",
            "site_name",
            "address",
            "pincode",
            "city",
            "state",
            "oc_number",
            "installation_date",
            "service_profile",
            "quotes",
        ]


class SiteProfileUpdateSerializer(serializers.Serializer):
    dc_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    service_type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    service_interval_days = serializers.IntegerField(required=False, allow_null=True)
    last_serviced_date = serializers.DateField(required=False, allow_null=True)
    technician_display_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


# ---- Schedule ---------------------------------------------------------------

class ScheduleReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceSchedule
        fields = [
            "id",
            "site_id",
            "amc_quote_id",
            "service_type",
            "scheduled_date",
            "scheduled_time",
            "technician_display_name",
            "status",
            "notes",
        ]


class ScheduleCreateUpdateSerializer(serializers.Serializer):
    site_id = serializers.UUIDField(required=False) # Only needed for create
    amc_quote_id = serializers.UUIDField(required=False, allow_null=True)
    service_type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    scheduled_date = serializers.DateField(required=False)
    scheduled_time = serializers.TimeField(required=False, allow_null=True)
    technician_display_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    status = serializers.CharField(max_length=20, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


# ---- Service Report ---------------------------------------------------------

class ReportAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportAttachment
        fields = ["id", "file", "file_name", "file_type", "file_size"]


class ServiceReportReadSerializer(serializers.ModelSerializer):
    attachments = ReportAttachmentSerializer(many=True, read_only=True)
    
    class Meta:
        model = ServiceReport
        fields = [
            "id",
            "site_id",
            "schedule_id",
            "report_code",
            "service_date",
            "zone",
            "technician_display_name",
            "remarks",
            "service_person_name",
            "service_person_signature",
            "client_name",
            "client_signature",
            "status",
            "attachments",
        ]


# ---- Water Report -----------------------------------------------------------

class WaterReportReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaterReport
        fields = [
            "id",
            "site_id",
            "date_tested",
            "ph",
            "tds",
            "hardness",
            "iron",
            "technician_display_name",
            "remarks",
            "attachment",
        ]


# ---- Complaint --------------------------------------------------------------

class ComplaintReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Complaint
        fields = [
            "id",
            "site_id",
            "description",
            "priority",
            "status",
            "assigned_service_person_name",
            "attachment",
            "resolved_at",
            "created_at",
            "complainant_user_id",
        ]
