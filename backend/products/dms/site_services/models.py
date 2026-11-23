"""
Site Services models: ServiceSchedule, ServiceReport, ReportAttachment,
WaterReport, Complaint.

All models inherit ``TerritoryScopedModel`` (schema review #01 — every table
carries its own ``territory_id``).  Technician references use a plain UUID
plus a display-name snapshot (schema review #09).  Signatures are stored
as file paths, not Base64 (schema review #10).
"""

from __future__ import annotations

import uuid

from django.db import models

from shared.base_models import TerritoryScopedModel

# ============================================================================
# SiteServiceProfile
# ============================================================================

class SiteServiceProfile(TerritoryScopedModel):
    """
    Service details for a confirmed site, editable from the Scheduling screen.
    """

    # Lives wherever its site lives.
    home_follows = ("site",)
    site = models.OneToOneField(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="service_profile",
    )
    dc_number = models.CharField(max_length=100, blank=True, default="")
    service_type = models.CharField(max_length=100, blank=True, default="")
    service_interval_days = models.PositiveIntegerField(null=True, blank=True)
    last_serviced_date = models.DateField(null=True, blank=True)

    technician_user_id = models.UUIDField(null=True, blank=True)
    technician_display_name = models.CharField(max_length=255, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["territory_id", "site_id"]),
        ]

    def __str__(self) -> str:
        return f"Profile for {self.site_id}"


# ============================================================================
# ServiceSchedule
# ============================================================================

class ScheduleStatus(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Scheduled"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    MISSED = "MISSED", "Missed"
    CANCELLED = "CANCELLED", "Cancelled"


class ServiceSchedule(TerritoryScopedModel):
    """
    A scheduled service visit for a confirmed site.

    Frontend ref: ScheduleEntry interface — date, time, type, technician,
    status, notes.  ScheduleModal — siteId, serviceType, scheduledDate,
    technician, notes.
    """

    # Lives wherever its site lives.
    home_follows = ("site",)

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

    # THE TECHNICIAN IS A PERSON, not a typed name: an active member of the
    # site's own unit with DMS access (a dealer's people for a dealer's site,
    # the organisation's own people for a head-office site). The id points at
    # `accounts_user` in the control database, so it is a plain UUID checked
    # by `services._assignable_or_raise`, not a foreign key. The name is a
    # snapshot taken at assignment, so an old visit still reads correctly
    # after somebody is renamed or leaves.
    technician_user_id = models.UUIDField(null=True, blank=True)
    technician_display_name = models.CharField(max_length=255, blank=True, default="")
    assigned_by_user_id = models.UUIDField(null=True, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)

    # THE VISIT'S LIFE, moved only by services -- never by a PATCH:
    #   SCHEDULED -> IN_PROGRESS (its report filed)
    #             -> COMPLETED   (the client signed that report)
    #   SCHEDULED / IN_PROGRESS -> CANCELLED (a manager, with a reason)
    # "Overdue" is not stored: it is a SCHEDULED visit whose date has passed.
    status = models.CharField(
        max_length=20,
        choices=ScheduleStatus.choices,
        default=ScheduleStatus.SCHEDULED,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    # WHAT HAPPENED TO THIS VISIT, oldest first: cancelled (when, by whom, why)
    # and rescheduled (from which date to which). A cancelled visit is
    # rescheduled in place rather than replaced, so this is where the
    # cancellation stays on record. Written only by services.
    history = models.JSONField(default=list, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["territory_id", "status"]),
            models.Index(fields=["territory_id", "scheduled_date"]),
            models.Index(fields=["territory_id", "site_id"]),
            # "My visits": one technician's visits in date order.
            models.Index(
                fields=["territory_id", "technician_user_id", "scheduled_date"],
                name="sched_unit_tech_date",
            ),
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


class ApprovalStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class ServiceReport(TerritoryScopedModel):
    """
    A service report filed by a technician after visiting a site.

    Frontend ref: ServiceReportModal — siteId, zone, technician, date,
    remarks, servicePersonName, servicePersonSignature, clientName,
    clientSignature, attachments.

    ServiceReportEntry — report_code, date, technician, zone, remarks, status.
    """

    # Lives wherever its site lives.
    home_follows = ("site",)

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.PROTECT,
        related_name="service_reports",
    )
    # ONE REPORT PER VISIT. Its signature is what completes the visit, so a
    # second report for the same visit would make "which one completed it"
    # unanswerable. Nullable: a breakdown call with no visit booked still
    # gets a report. SET_NULL: deleting a visit keeps the signed report.
    schedule = models.OneToOneField(
        ServiceSchedule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_report",
    )

    report_code = models.CharField(max_length=50, blank=True, default="")
    service_date = models.DateField()

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

    # Review outcome: approve when everything is correct, reject otherwise.
    client_approval_status = models.CharField(
        max_length=30,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING,
    )
    approval_remarks = models.TextField(blank=True, default="")
    approved_at = models.DateTimeField(null=True, blank=True)
    sign_link_token = models.UUIDField(default=uuid.uuid4, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["territory_id", "status"]),
            models.Index(fields=["territory_id", "site_id"]),
            models.Index(fields=["territory_id", "-service_date"]),
        ]

    def __str__(self) -> str:
        return f"Report {self.report_code} — {self.site_id}"


# ============================================================================
# ReportAttachment
# ============================================================================

class ReportAttachment(TerritoryScopedModel):
    """
    A file (photo, PDF, etc.) attached to a service report.

    Frontend ref: ServiceReportModal — file input with multiple accept types.
    """

    # Lives wherever the report or complaint it is attached to lives.
    home_follows = ("service_report", "water_report", "complaint")

    service_report = models.ForeignKey(
        ServiceReport,
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
        blank=True,
    )
    water_report = models.ForeignKey(
        "WaterReport",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
        blank=True,
    )
    complaint = models.ForeignKey(
        "Complaint",
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
        blank=True,
    )
    file = models.FileField(upload_to="reports/attachments/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_type = models.CharField(max_length=50, blank=True, default="")
    file_size = models.PositiveIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["territory_id", "service_report_id"]),
            models.Index(fields=["territory_id", "water_report_id"]),
            models.Index(fields=["territory_id", "complaint_id"]),
        ]

    def __str__(self) -> str:
        return self.file_name or str(self.file)


# ============================================================================
# WaterReport
# ============================================================================

class WaterReport(TerritoryScopedModel):
    """
    Water quality report for a deployed site.

    Frontend ref: WaterReportEntry — date, ph, tds, hardness, iron,
    technician, remarks.  WaterReportModal — siteId, date, attachment.
    """

    # Lives wherever its site lives.
    home_follows = ("site",)

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.PROTECT,
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
            models.Index(fields=["territory_id", "site_id"]),
            models.Index(fields=["territory_id", "-date_tested"]),
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


class Complaint(TerritoryScopedModel):
    """
    A customer complaint about a deployed site.

    Frontend ref: ComplaintEntry — date, issue, priority, status,
    servicePersonName, siteId.  ComplaintModal — issue, servicePersonName,
    attachment.
    """

    # Lives wherever its site lives.
    home_follows = ("site",)

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.PROTECT,
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

    # THE ASSIGNED PERSON, the same rule as a visit's technician (C-local-5):
    # an active member of the site's own unit with DMS access, checked by the
    # service; the name is a snapshot taken at assignment.
    assigned_service_person_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
    )
    assigned_service_person_user_id = models.UUIDField(null=True, blank=True)
    assigned_by_user_id = models.UUIDField(null=True, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)

    attachment = models.FileField(
        upload_to="complaints/",
        blank=True,
        default="",
    )
    # STATUS MOVES THROUGH `set_complaint_status`, never a PATCH:
    #   OPEN -> IN_PROGRESS -> RESOLVED (with what was done) -> CLOSED
    #   RESOLVED / CLOSED -> OPEN (reopened)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by_user_id = models.UUIDField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["territory_id", "status"]),
            models.Index(fields=["territory_id", "site_id"]),
            models.Index(fields=["territory_id", "-created_at"]),
            # "My complaints": the assigned person's own.
            models.Index(
                fields=["territory_id", "assigned_service_person_user_id"],
                name="complaint_unit_assignee",
            ),
        ]

    def __str__(self) -> str:
        return f"Complaint: {self.description[:50]}"
