"""
Serializers for Site Services.
"""

from rest_framework import serializers

from products.dms.sales.api.serializers import FollowupReadSerializer, QuotationReadSerializer
from products.dms.sales.models import ConfirmedSite

from ..models import (
    Complaint,
    ReportAttachment,
    ServiceReport,
    ServiceSchedule,
    SiteServiceProfile,
    WaterReport,
)


class CompanyNameMixin(serializers.Serializer):
    """
    `company_name`: whose report this is -- the name of the unit it belongs
    to, which is the site's dealership, or the organisation itself for a
    head-office site. Printed as the report's heading in place of a fixed name.

    The unit lives in the control database, so names are looked up once per
    unit per response and cached on the root serializer, not once per row.
    """

    company_name = serializers.SerializerMethodField()

    def get_company_name(self, obj) -> str:
        from core.organizations.models import BusinessUnit

        cache = self.root.__dict__.setdefault("_unit_names", {})
        unit_id = getattr(obj, "unit_id", None)
        if unit_id not in cache:
            unit = BusinessUnit.objects.using("default").filter(id=unit_id).only("name").first()
            cache[unit_id] = unit.name if unit else ""
        return cache[unit_id]


# ---- Site & Profile ---------------------------------------------------------
# (unchanged below until Water Report)

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
    quotes = QuotationReadSerializer(many=True, read_only=True, source="enquiry.quotations")
    followups = FollowupReadSerializer(many=True, read_only=True, source="enquiry.followups")
    enquiry_id = serializers.UUIDField(read_only=True)
    # The machine quote this site was confirmed on --- its title is the machine.
    confirmed_quote_id = serializers.UUIDField(read_only=True, allow_null=True)
    # Annotated by selectors.list_sites(); None when the site has no reports yet.
    last_service_report_date = serializers.DateField(read_only=True, allow_null=True, default=None)

    class Meta:
        model = ConfirmedSite
        fields = [
            "id",
            "enquiry_id",
            "confirmed_quote_id",
            "last_service_report_date",
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
            "followups",
        ]


class SiteProfileUpdateSerializer(serializers.Serializer):
    dc_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    service_type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    service_interval_days = serializers.IntegerField(required=False, allow_null=True)
    last_serviced_date = serializers.DateField(required=False, allow_null=True)
    technician_display_name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True)


# ---- Schedule ---------------------------------------------------------------

class ScheduleReadSerializer(serializers.ModelSerializer):
    # The visit's report, if one was filed for it: the screen offers "File
    # report" without one and "Open report" with one.
    report_id = serializers.SerializerMethodField()
    report_status = serializers.SerializerMethodField()

    class Meta:
        model = ServiceSchedule
        fields = [
            "id",
            "site_id",
            "amc_quote_id",
            "service_type",
            "scheduled_date",
            "scheduled_time",
            "technician_user_id",
            "technician_display_name",
            "assigned_at",
            "status",
            "started_at",
            "completed_at",
            "cancelled_at",
            "cancel_reason",
            "notes",
            "report_id",
            "report_status",
            "history",
        ]

    @staticmethod
    def _report(obj):
        try:
            return obj.service_report
        except ServiceReport.DoesNotExist:
            return None

    def get_report_id(self, obj):
        report = self._report(obj)
        return str(report.id) if report else None

    def get_report_status(self, obj):
        report = self._report(obj)
        return report.status if report else None


class ScheduleCreateUpdateSerializer(serializers.Serializer):
    """
    What booking or editing a visit may send. NO `status` -- a visit moves
    through Cancel and its service report, never by being told what it
    is -- and NO free-text technician: `technician_user_id` names a person,
    checked by the service against the site's own unit.
    """

    site_id = serializers.UUIDField(required=False)  # create only
    amc_quote_id = serializers.UUIDField(required=False, allow_null=True)
    service_type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    scheduled_date = serializers.DateField(required=False)
    scheduled_time = serializers.TimeField(required=False, allow_null=True)
    technician_user_id = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class VisitRescheduleSerializer(serializers.Serializer):
    scheduled_date = serializers.DateField()
    scheduled_time = serializers.TimeField(required=False, allow_null=True)
    technician_user_id = serializers.UUIDField(required=False, allow_null=True)


class VisitCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000)


class UnitPersonSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    name = serializers.CharField()
    email = serializers.CharField()


# ---- Service Report ---------------------------------------------------------

class ReportAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportAttachment
        fields = ["id", "file", "file_name", "file_type", "file_size"]


class ServiceReportReadSerializer(CompanyNameMixin, serializers.ModelSerializer):
    attachments = ReportAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceReport
        fields = [
            "id",
            "company_name",
            "site_id",
            "schedule_id",
            "report_code",
            "service_date",
            "technician_user_id",
            "technician_display_name",
            "remarks",
            "service_person_name",
            "service_person_signature",
            "client_name",
            "client_signature",
            "status",
            "client_approval_status",
            "approval_remarks",
            "approved_at",
            "sign_link_token",
            "attachments",
        ]


# ---- Water Report -----------------------------------------------------------

class WaterReportReadSerializer(CompanyNameMixin, serializers.ModelSerializer):
    attachments = ReportAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = WaterReport
        fields = [
            "id",
            "company_name",
            "site_id",
            "date_tested",
            "technician_display_name",
            "remarks",
            "attachment",
            "attachments",
        ]


# ---- Complaint --------------------------------------------------------------

class ComplaintReadSerializer(CompanyNameMixin, serializers.ModelSerializer):
    attachments = ReportAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Complaint
        fields = [
            "id",
            "company_name",
            "site_id",
            "description",
            "priority",
            "status",
            "assigned_service_person_name",
            "assigned_service_person_user_id",
            "assigned_at",
            "attachment",
            "attachments",
            "resolved_at",
            "resolved_by_user_id",
            "resolution_notes",
            "created_at",
            "complainant_user_id",
        ]


class ComplaintStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["IN_PROGRESS", "RESOLVED", "CLOSED", "OPEN"])
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
