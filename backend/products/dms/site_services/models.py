"""
Site Services models: ServiceSchedule, ServiceReport, ReportAttachment,
WaterReport, Complaint.

All models inherit ``UnitScopedModel`` (schema review #01 — every table
carries its own ``unit_id``).  Technician references use a plain UUID
plus a display-name snapshot (schema review #09).  Signatures are stored
as file paths, not Base64 (schema review #10).
"""

from __future__ import annotations

from django.db import models

from shared.base_models import UnitScopedModel


# ============================================================================
# ServiceSchedule
# ============================================================================

class ScheduleStatus(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Scheduled"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    MISSED = "MISSED", "Missed"
    CANCELLED = "CANCELLED", "Cancelled"


class ServiceSchedule(UnitScopedModel):
    """
    A scheduled service visit for a confirmed site.

    Frontend ref: ScheduleEntry interface — date, time, type, technician,
    status, notes.  ScheduleModal — siteId, serviceType, scheduledDate,
    technician, notes.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="service_schedules",
    )
    # The AMC quote that spawned this schedule (if any).
    amc_quote = models.ForeignKey(
        "dms_sales.Quotation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_schedules",
    )

    service_type = models.CharField(max_length=100, blank=True, default="")
    scheduled_date = models.DateField()
    scheduled_time = models.TimeField(null=True, blank=True)

    # Schema review #09: technician is a person, not just a name.
    technician_user_id = models.UUIDField(null=True, blank=True)
    technician_display_name = models.CharField(max_length=255, blank=True, default="")

    status = models.CharField(
        max_length=20,
        choices=ScheduleStatus.choices,
        default=ScheduleStatus.SCHEDULED,
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "scheduled_date"]),
            models.Index(fields=["unit_id", "site_id"]),
        ]

    def __str__(self) -> str:
        return f"Schedule: {self.site_id} on {self.scheduled_date}"


# ============================================================================
# ServiceReport
# ============================================================================

class ReportStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    AWAITING_CLIENT_SIGN = "AWAITING_CLIENT_SIGN", "Awaiting Client Signature"


class ServiceReport(UnitScopedModel):
    """
    A service report filed by a technician after visiting a site.

    Frontend ref: ServiceReportModal — siteId, zone, technician, date,
    remarks, servicePersonName, servicePersonSignature, clientName,
    clientSignature, attachments.

    ServiceReportEntry — report_code, date, technician, zone, remarks, status.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="service_reports",
    )
    schedule = models.ForeignKey(
        ServiceSchedule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_reports",
    )

    report_code = models.CharField(max_length=50, blank=True, default="")
    service_date = models.DateField()
    zone = models.CharField(max_length=100, blank=True, default="")

    # Schema review #09: technician stored as UUID + display name.
    technician_user_id = models.UUIDField(null=True, blank=True)
    technician_display_name = models.CharField(max_length=255, blank=True, default="")

    remarks = models.TextField(blank=True, default="")

    # ---- Signatures (schema review #10: file paths, not Base64) ----
    service_person_name = models.CharField(max_length=255)
    service_person_signature = models.FileField(
        upload_to="reports/signatures/tech/",
        blank=True,
        default="",
    )

    client_name = models.CharField(max_length=255, blank=True, default="")
    client_signature = models.FileField(
        upload_to="reports/signatures/client/",
        blank=True,
        default="",
    )
    client_signed_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=30,
        choices=ReportStatus.choices,
        default=ReportStatus.PENDING,
    )

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "site_id"]),
            models.Index(fields=["unit_id", "-service_date"]),
        ]

    def __str__(self) -> str:
        return f"Report {self.report_code} — {self.site_id}"


# ============================================================================
# ReportAttachment
# ============================================================================

class ReportAttachment(UnitScopedModel):
    """
    A file (photo, PDF, etc.) attached to a service report.

    Frontend ref: ServiceReportModal — file input with multiple accept types.
    """

    service_report = models.ForeignKey(
        ServiceReport,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="reports/attachments/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_type = models.CharField(max_length=50, blank=True, default="")
    file_size = models.PositiveIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "service_report_id"]),
        ]

    def __str__(self) -> str:
        return self.file_name or str(self.file)


# ============================================================================
# WaterReport
# ============================================================================

class WaterReport(UnitScopedModel):
    """
    Water quality report for a deployed site.

    Frontend ref: WaterReportEntry — date, ph, tds, hardness, iron,
    technician, remarks.  WaterReportModal — siteId, date, attachment.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="water_reports",
    )
    date_tested = models.DateField()

    # Water quality parameters shown in the WaterReportEntry table.
    ph = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    tds = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    hardness = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    iron = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)

    technician_user_id = models.UUIDField(null=True, blank=True)
    technician_display_name = models.CharField(max_length=255, blank=True, default="")

    remarks = models.TextField(blank=True, default="")
    attachment = models.FileField(
        upload_to="reports/water/",
        blank=True,
        default="",
    )

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "site_id"]),
            models.Index(fields=["unit_id", "-date_tested"]),
        ]

    def __str__(self) -> str:
        return f"Water Report: {self.site_id} on {self.date_tested}"


# ============================================================================
# Complaint
# ============================================================================

class ComplaintPriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class ComplaintStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    RESOLVED = "RESOLVED", "Resolved"
    CLOSED = "CLOSED", "Closed"


class Complaint(UnitScopedModel):
    """
    A customer complaint about a deployed site.

    Frontend ref: ComplaintEntry — date, issue, priority, status,
    servicePersonName, siteId.  ComplaintModal — issue, servicePersonName,
    attachment.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="complaints",
    )
    # The platform user who logged the complaint (customer or dealer rep).
    complainant_user_id = models.UUIDField(null=True, blank=True)

    description = models.TextField()
    priority = models.CharField(
        max_length=10,
        choices=ComplaintPriority.choices,
        default=ComplaintPriority.MEDIUM,
    )
    status = models.CharField(
        max_length=15,
        choices=ComplaintStatus.choices,
        default=ComplaintStatus.OPEN,
    )

    # The service person assigned to resolve the complaint.
    assigned_service_person_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )
    assigned_service_person_user_id = models.UUIDField(null=True, blank=True)

    attachment = models.FileField(
        upload_to="complaints/",
        blank=True,
        default="",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "site_id"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Complaint: {self.description[:50]}"
