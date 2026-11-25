"""
Write logic for Site Services.
"""

from __future__ import annotations

import base64
import random
import uuid

from django.core.files.base import ContentFile
from django.utils import timezone

from config.transactions import tenant_atomic
from core.organizations.selectors import dms_people_for_unit
from products.dms.sales.models import ConfirmedSite, Quotation
from shared.exceptions import AuthorizationError, ConflictError, FieldError, InvalidInputError

from .exceptions import not_found
from .models import (
    Complaint,
    ComplaintStatus,
    ReportAttachment,
    ReportStatus,
    ScheduleStatus,
    ServiceReport,
    ServiceSchedule,
    SiteServiceProfile,
    WaterReport,
)


def _decode_base64_signature(b64_string: str, name_prefix: str) -> ContentFile | None:
    """Helper to decode base64 signature strings from SignaturePad into Django ContentFile."""
    if not b64_string or not b64_string.startswith("data:image/"):
        return None

    try:
        format_str, img_str = b64_string.split(';base64,')
        ext = format_str.split('/')[-1]
        data = base64.b64decode(img_str)
        return ContentFile(data, name=f"{name_prefix}_{uuid.uuid4().hex[:8]}.{ext}")
    except Exception:
        return None


@tenant_atomic
def update_site_profile(
    *,
    site_id: uuid.UUID,
    unit_id: uuid.UUID,
    **kwargs
) -> SiteServiceProfile:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    profile, _ = SiteServiceProfile.objects.get_or_create(
        site=site,
        defaults={"unit_id": unit_id}
    )

    for key, value in kwargs.items():
        if hasattr(profile, key):
            setattr(profile, key, value)

    profile.save()
    return profile


# ---- Visits ----------------------------------------------------------------
#
# A visit belongs to its SITE'S unit, never to whoever books it: an
# organisation admin scheduling a dealer's site books the dealer's visit,
# which the dealer can then see and staff. (It used to take the booker's unit,
# filing every org-booked visit under the head office.)

#: A visit in one of these is finished; it can no longer be edited, cancelled
#: or given a report.
CLOSED_VISIT_STATUSES = ("COMPLETED", "CANCELLED")


def _assignable_or_raise(*, organization, site: ConfirmedSite, user_id: uuid.UUID) -> str:
    """The person's display name, if they may be given work on this site."""
    for person in dms_people_for_unit(organization=organization, unit_id=site.unit_id):
        if str(person.user_id) == str(user_id):
            return person.name
    raise InvalidInputError(
        "That person cannot be assigned to this site.",
        field_errors=[
            FieldError(
                field="technician_user_id",
                code="not_assignable",
                detail="Choose someone from this site's own dealership (or the "
                "organisation, for its own sites) who has access to DMS.",
            )
        ],
    )


def _apply_assignment(schedule, *, organization, site, technician_user_id, actor_user_id) -> None:
    if not technician_user_id:
        schedule.technician_user_id = None
        schedule.technician_display_name = ""
        schedule.assigned_by_user_id = None
        schedule.assigned_at = None
        return
    if str(schedule.technician_user_id) == str(technician_user_id):
        return  # unchanged: keep who assigned it and when
    schedule.technician_display_name = _assignable_or_raise(
        organization=organization, site=site, user_id=technician_user_id
    )
    schedule.technician_user_id = technician_user_id
    schedule.assigned_by_user_id = actor_user_id
    schedule.assigned_at = timezone.now()


def _get_visit(schedule_id: uuid.UUID) -> ServiceSchedule:
    schedule = ServiceSchedule.objects.select_related("site").filter(id=schedule_id).first()
    if not schedule:
        raise not_found("Visit")
    return schedule


def _refuse_if_closed(schedule: ServiceSchedule, action: str) -> None:
    if schedule.status in CLOSED_VISIT_STATUSES:
        raise ConflictError(
            code="visit_closed",
            message=(
                f"This visit is {schedule.get_status_display().lower()} and cannot be {action}."
            ),
        )


@tenant_atomic
def create_schedule(
    *,
    organization,
    site_id: uuid.UUID,
    actor_user_id: uuid.UUID | None = None,
    technician_user_id: uuid.UUID | None = None,
    **kwargs,
) -> ServiceSchedule:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    # A visit booked while the site has a confirmed AMC belongs to that contract.
    #
    # AND NO AMC, NO VISIT: maintenance is what an AMC buys. A site whose AMC
    # is not confirmed cannot be scheduled -- the Scheduled Services screen
    # does not list it, and this refuses a request that bypasses the screen.
    active_amc = (
        Quotation.objects.filter(site=site, quote_type="AMC", status="CONFIRMED")
        .order_by("-created_at")
        .first()
    )
    if active_amc is None:
        raise ConflictError(
            code="no_active_amc",
            message="This site has no confirmed AMC. Confirm an AMC quote for it first.",
        )
    if not kwargs.get("amc_quote_id"):
        kwargs["amc_quote_id"] = active_amc.id

    schedule = ServiceSchedule(
        unit_id=site.unit_id,
        site=site,
        created_by_user_id=actor_user_id,
        **kwargs,
    )
    _apply_assignment(
        schedule,
        organization=organization,
        site=site,
        technician_user_id=technician_user_id,
        actor_user_id=actor_user_id,
    )
    schedule.save()
    return schedule


#: What a PATCH may change. Status is not here: it moves only through
#: cancel_visit and the visit's service report.
_EDITABLE_VISIT_FIELDS = ("service_type", "scheduled_date", "scheduled_time", "notes")


@tenant_atomic
def update_schedule(
    *,
    organization,
    schedule_id: uuid.UUID,
    actor_user_id: uuid.UUID | None = None,
    **kwargs,
) -> ServiceSchedule:
    schedule = _get_visit(schedule_id)
    _refuse_if_closed(schedule, "edited")

    for key in _EDITABLE_VISIT_FIELDS:
        if key in kwargs:
            setattr(schedule, key, kwargs[key])
    if "technician_user_id" in kwargs:
        _apply_assignment(
            schedule,
            organization=organization,
            site=schedule.site,
            technician_user_id=kwargs["technician_user_id"],
            actor_user_id=actor_user_id,
        )
    schedule.updated_by_user_id = actor_user_id
    schedule.save()
    return schedule


def _log(schedule: ServiceSchedule, event: str, actor_user_id, **details) -> None:
    """Add one line to the visit's history. Dates are written as ISO strings."""
    entry = {"event": event, "at": timezone.now().isoformat(), "by": str(actor_user_id or "")}
    entry.update({k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in details.items()})
    schedule.history = [*(schedule.history or []), entry]


@tenant_atomic
def cancel_visit(
    *, schedule_id: uuid.UUID, reason: str, actor_user_id: uuid.UUID
) -> ServiceSchedule:
    """
    Call a visit off, saying why. It can be rescheduled later (in place), so
    the cancellation is also written to its history.

    NOT ONCE A REPORT IS FILED for it: that work happened. Delete the report
    first if it was filed by mistake.
    """
    schedule = _get_visit(schedule_id)
    _refuse_if_closed(schedule, "cancelled")
    if ServiceReport.objects.filter(schedule_id=schedule.id).exists():
        raise ConflictError(
            code="visit_has_report",
            message="This visit already has a service report, so it cannot be cancelled.",
        )
    if not (reason or "").strip():
        raise InvalidInputError(
            "Give a reason for cancelling.",
            field_errors=[FieldError(field="reason", code="required", detail="Give a reason.")],
        )
    schedule.status = ScheduleStatus.CANCELLED
    schedule.cancelled_at = timezone.now()
    schedule.cancel_reason = reason.strip()
    schedule.updated_by_user_id = actor_user_id
    _log(schedule, "cancelled", actor_user_id, date=schedule.scheduled_date, reason=reason.strip())
    schedule.save(
        update_fields=[
            "status", "cancelled_at", "cancel_reason", "history", "updated_by_user_id", "updated_at"
        ]
    )
    return schedule


_UNCHANGED = object()


@tenant_atomic
def reschedule_visit(
    *,
    organization,
    schedule_id: uuid.UUID,
    scheduled_date,
    actor_user_id: uuid.UUID,
    scheduled_time=_UNCHANGED,
    technician_user_id=_UNCHANGED,
) -> ServiceSchedule:
    """
    Put a CANCELLED visit back on the schedule, on a new date -- the same
    visit, not a new one. Its cancellation stays in `history`.

    The site must still be under a confirmed AMC: no AMC, no visit.
    """
    schedule = _get_visit(schedule_id)
    if schedule.status != ScheduleStatus.CANCELLED:
        raise ConflictError(
            code="not_cancelled",
            message="Only a cancelled visit can be rescheduled. Edit this one's date instead.",
        )
    if not Quotation.objects.filter(
        site_id=schedule.site_id, quote_type="AMC", status="CONFIRMED"
    ).exists():
        raise ConflictError(
            code="no_active_amc",
            message="This site no longer has a confirmed AMC, so the visit cannot be rescheduled.",
        )

    old_date = schedule.scheduled_date
    schedule.scheduled_date = scheduled_date
    if scheduled_time is not _UNCHANGED:
        schedule.scheduled_time = scheduled_time
    if technician_user_id is not _UNCHANGED:
        _apply_assignment(
            schedule,
            organization=organization,
            site=schedule.site,
            technician_user_id=technician_user_id,
            actor_user_id=actor_user_id,
        )
    schedule.status = ScheduleStatus.SCHEDULED
    schedule.cancelled_at = None
    schedule.cancel_reason = ""
    schedule.started_at = None
    schedule.completed_at = None
    schedule.updated_by_user_id = actor_user_id
    _log(schedule, "rescheduled", actor_user_id, from_date=old_date, to_date=scheduled_date)
    schedule.save()
    return schedule


def _sync_visit_from_report(report: ServiceReport) -> None:
    """
    THE ONE PLACE A REPORT MOVES ITS VISIT. Called after every report write --
    filed, edited, signed in the form, signed through the public link.

    Signed by the client -> the visit is COMPLETED, and the site's "last
    serviced" moves forward so the next service date follows. Not yet signed
    -> the visit is IN_PROGRESS: the work is done, the proof is not.
    """
    if report.schedule_id is None:
        return
    visit = ServiceSchedule.objects.filter(id=report.schedule_id).first()
    if visit is None or visit.status == ScheduleStatus.CANCELLED:
        return

    now = timezone.now()
    if report.status == ReportStatus.COMPLETED:
        visit.status = ScheduleStatus.COMPLETED
        visit.completed_at = report.client_signed_at or now
        visit.started_at = visit.started_at or visit.completed_at
        profile, _ = SiteServiceProfile.objects.get_or_create(
            site_id=visit.site_id, defaults={"unit_id": visit.unit_id}
        )
        if profile.last_serviced_date is None or report.service_date > profile.last_serviced_date:
            profile.last_serviced_date = report.service_date
            profile.save(update_fields=["last_serviced_date", "updated_at"])
    else:
        visit.status = ScheduleStatus.IN_PROGRESS
        visit.started_at = visit.started_at or now
        visit.completed_at = None
    visit.save(update_fields=["status", "started_at", "completed_at", "updated_at"])


def _attach_report_to_visit(report: ServiceReport, schedule_id, site: ConfirmedSite) -> None:
    """Validate the visit a new report is filed for, and take its technician."""
    visit = ServiceSchedule.objects.filter(id=schedule_id).first()
    if visit is None:
        raise not_found("Visit")
    if visit.site_id != site.id:
        raise InvalidInputError(
            "That visit belongs to a different site.",
            field_errors=[
                FieldError(
                    field="schedule_id", code="wrong_site", detail="That visit is for another site."
                )
            ],
        )
    _refuse_if_closed(visit, "reported on")
    if ServiceReport.objects.filter(schedule_id=visit.id).exists():
        raise ConflictError(
            code="visit_has_report",
            message="This visit already has a service report. Open and edit that one instead.",
        )
    report.schedule = visit
    if visit.technician_user_id and not report.technician_user_id:
        report.technician_user_id = visit.technician_user_id
        report.technician_display_name = (
            report.technician_display_name or visit.technician_display_name
        )


#: Visits that have not happened yet. Deleting an AMC cancels these; visits that
#: already happened (completed, missed, cancelled) stay as history.
UPCOMING_VISIT_STATUSES = (ScheduleStatus.SCHEDULED, ScheduleStatus.IN_PROGRESS)


def schedule_dependencies(*, schedule_id: uuid.UUID) -> dict:
    """What deleting this visit would affect --- shown to the user before they confirm."""
    schedule = ServiceSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        raise not_found("Schedule")
    return {
        "service_reports": ServiceReport.objects.filter(schedule=schedule).count(),
    }


@tenant_atomic
def delete_schedule(*, schedule_id: uuid.UUID, confirmed: bool = False) -> None:
    """
    Delete a visit. Its service reports are KEPT --- they are signed customer
    records and stay under the site's Service Reports, just no longer tied to
    this visit (the FK is SET_NULL). If it has any, the caller must have shown
    that to the user and passed `confirmed=True`.
    """
    schedule = ServiceSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        raise not_found("Schedule")
    if schedule_dependencies(schedule_id=schedule_id)["service_reports"] and not confirmed:
        raise ConflictError(
            code="has_dependents",
            message="This visit has service reports. Confirm to delete it; the reports are kept.",
        )
    schedule.delete()


@tenant_atomic
def cancel_scheduled_visits_for_unconfirmed_amc(
    *, quote_id: uuid.UUID, actor_user_id: uuid.UUID | None
) -> int:
    """
    The AMC these visits were booked under was unconfirmed: call off the ones
    that have not happened, saying why. They stay as cancelled visits with the
    reason in their history (not deleted), and can be rescheduled once the site
    has a confirmed AMC again. Idempotent --- a second run finds none scheduled.
    """
    reason = "AMC unconfirmed"
    count = 0
    for schedule in ServiceSchedule.objects.select_for_update().filter(
        amc_quote_id=quote_id, status=ScheduleStatus.SCHEDULED
    ):
        schedule.status = ScheduleStatus.CANCELLED
        schedule.cancelled_at = timezone.now()
        schedule.cancel_reason = reason
        schedule.updated_by_user_id = actor_user_id
        _log(schedule, "cancelled", actor_user_id, date=schedule.scheduled_date, reason=reason)
        schedule.save(
            update_fields=[
                "status", "cancelled_at", "cancel_reason", "history", "updated_by_user_id",
                "updated_at",
            ]
        )
        count += 1
    return count


@tenant_atomic
def cancel_upcoming_visits_for_amc_quote(*, quote_id: uuid.UUID) -> int:
    """Delete the visits an AMC quote booked that have not happened yet."""
    upcoming = ServiceSchedule.objects.filter(
        amc_quote_id=quote_id, status__in=UPCOMING_VISIT_STATUSES
    )
    count = upcoming.count()
    upcoming.delete()
    return count


@tenant_atomic
def create_service_report(
    *,
    unit_id: uuid.UUID,
    site_id: uuid.UUID,
    service_person_signature: str | None = None,
    client_signature: str | None = None,
    files: list | None = None,
    **kwargs
) -> ServiceReport:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")
    schedule_id = kwargs.pop("schedule_id", None) or None
    kwargs.pop("schedule", None)

    # NOT A SECRET, so S311 does not apply: this is a human-facing
    # reference number, not a token.
    #
    # THE REAL PROBLEM WITH THIS LINE is that 9,000 possible values collide
    # long before they run out -- a 50% chance of a duplicate after a few
    # dozen reports -- and the column has no uniqueness constraint.
    # Reference numbering is Q31, still open.
    report_code = f"SR/{random.randint(1000, 9999)}"  # noqa: S311

    # The site's unit, not the filer's (see "Visits" above).
    report = ServiceReport(
        unit_id=site.unit_id,
        site=site,
        report_code=report_code,
        **kwargs
    )
    if schedule_id:
        _attach_report_to_visit(report, schedule_id, site)

    if service_person_signature:
        f = _decode_base64_signature(service_person_signature, "tech_sig")
        if f:
            report.service_person_signature = f

    if client_signature:
        f = _decode_base64_signature(client_signature, "client_sig")
        if f:
            report.client_signature = f
            report.client_signed_at = timezone.now()
            report.status = ReportStatus.COMPLETED
        else:
            report.status = ReportStatus.AWAITING_CLIENT_SIGN
    else:
        report.status = ReportStatus.AWAITING_CLIENT_SIGN

    report.save()
    _sync_visit_from_report(report)

    if files:
        for file in files:
            ReportAttachment.objects.create(
                unit_id=report.unit_id,
                service_report=report,
                file=file,
                file_name=file.name,
                file_size=file.size,
                file_type=file.content_type
            )

    return report


@tenant_atomic
def update_service_report(
    *,
    report_id: uuid.UUID,
    service_person_signature: str | None = None,
    client_signature: str | None = None,
    files: list | None = None,
    **kwargs
) -> ServiceReport:
    report = ServiceReport.objects.filter(id=report_id).first()
    if not report:
        raise not_found("Service Report")
    # Which visit and site a report belongs to is fixed once it is filed.
    for fixed in ("schedule", "schedule_id", "site", "site_id", "unit_id"):
        kwargs.pop(fixed, None)

    for key, value in kwargs.items():
        if hasattr(report, key):
            setattr(report, key, value)

    if service_person_signature:
        f = _decode_base64_signature(service_person_signature, "tech_sig")
        if f:
            report.service_person_signature = f

    if client_signature:
        f = _decode_base64_signature(client_signature, "client_sig")
        if f:
            report.client_signature = f
            report.client_signed_at = timezone.now()
            report.status = ReportStatus.COMPLETED

    if (
        kwargs.get("client_approval_status") == "APPROVED" and
        report.client_approval_status != "APPROVED"
    ):
        report.approved_at = timezone.now()

    report.save()
    _sync_visit_from_report(report)

    if "kept_attachment_ids" in kwargs:
        kept_ids = kwargs.get("kept_attachment_ids", [])
        if not isinstance(kept_ids, list):
            kept_ids = [kept_ids]
        # Delete attachments not in the kept list
        ReportAttachment.objects.filter(service_report=report).exclude(id__in=kept_ids).delete()

    if files:
        for file in files:
            ReportAttachment.objects.create(
                unit_id=report.unit_id,
                service_report=report,
                file=file,
                file_name=file.name,
                file_size=file.size,
                file_type=file.content_type
            )

    return report


@tenant_atomic
def delete_service_report(*, report_id: uuid.UUID) -> None:
    """
    Delete a report. Its visit goes back to SCHEDULED -- the work it recorded
    is no longer on file -- unless the visit was cancelled meanwhile.
    """
    report = ServiceReport.objects.filter(id=report_id).first()
    if report is None:
        return
    visit_id = report.schedule_id
    report.delete()
    if visit_id:
        ServiceSchedule.objects.filter(id=visit_id).exclude(status=ScheduleStatus.CANCELLED).update(
            status=ScheduleStatus.SCHEDULED, started_at=None, completed_at=None
        )


@tenant_atomic
def record_client_signature(
    *, report: ServiceReport, signature_file: ContentFile, client_name: str
) -> ServiceReport:
    """
    The client signs through the public link. Completes the report and, through
    `_sync_visit_from_report`, the visit. The link token is rotated so the same
    link cannot sign twice.
    """
    report.client_signature = signature_file
    report.client_name = client_name
    report.client_signed_at = timezone.now()
    report.status = ReportStatus.COMPLETED
    report.sign_link_token = uuid.uuid4()
    report.save(
        update_fields=[
            "client_signature",
            "client_name",
            "client_signed_at",
            "status",
            "sign_link_token",
            "updated_at",
        ]
    )
    _sync_visit_from_report(report)
    return report


@tenant_atomic
def create_water_report(
    *,
    unit_id: uuid.UUID | None = None,
    site_id: uuid.UUID,
    attachment=None,
    files: list | None = None,
    **kwargs
) -> WaterReport:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    resolved_unit_id = site.unit_id  # the site's unit, not the person filing it

    valid_fields = {f.name for f in WaterReport._meta.get_fields()}
    filtered_kwargs = {}
    for k, v in kwargs.items():
        if k in valid_fields:
            if v == "" and k in ["ph", "tds", "hardness", "iron", "technician_user_id"]:
                filtered_kwargs[k] = None
            else:
                filtered_kwargs[k] = v

    report = WaterReport(
        unit_id=resolved_unit_id,
        site=site,
        **filtered_kwargs
    )
    if attachment:
        report.attachment = attachment
    report.save()

    if files:
        for file in files:
            ReportAttachment.objects.create(
                unit_id=report.unit_id,
                water_report=report,
                file=file,
                file_name=file.name,
                file_size=file.size,
                file_type=file.content_type
            )

    return report


@tenant_atomic
def update_water_report(
    *,
    report_id: uuid.UUID,
    attachment=None,
    files: list | None = None,
    **kwargs
) -> WaterReport:
    report = WaterReport.objects.filter(id=report_id).first()
    if not report:
        raise not_found("Water Report")

    for key, value in kwargs.items():
        if hasattr(report, key):
            if value == "" and key in ["technician_user_id"]:
                setattr(report, key, None)
            else:
                setattr(report, key, value)

    if attachment:
        report.attachment = attachment
    elif kwargs.get("clear_attachment") == "true":
        report.attachment = ""
    report.save()

    if "kept_attachment_ids" in kwargs:
        kept_ids = kwargs.get("kept_attachment_ids", [])
        if not isinstance(kept_ids, list):
            kept_ids = [kept_ids]
        ReportAttachment.objects.filter(water_report=report).exclude(id__in=kept_ids).delete()

    if files:
        for file in files:
            ReportAttachment.objects.create(
                unit_id=report.unit_id,
                water_report=report,
                file=file,
                file_name=file.name,
                file_size=file.size,
                file_type=file.content_type
            )

    return report


@tenant_atomic
def delete_water_report(*, report_id: uuid.UUID) -> None:
    WaterReport.objects.filter(id=report_id).delete()


# ---- Complaints ------------------------------------------------------------
#
# The visit rules (C-local-5): the complaint belongs to its SITE's unit, the
# assigned person is a real member of that unit, and status moves through
# `set_complaint_status` only. Who may do what:
#
#   manager (assigns, sees all)  -- passed in as `can_manage` by the view
#   the assigned person          -- works it: In progress, Resolved
#   whoever raised it            -- edits what they wrote, may reopen it

_COMPLAINT_TEXT_FIELDS = ("description", "priority")


def _attach_files(complaint: Complaint, files) -> None:
    for file in files or []:
        ReportAttachment.objects.create(
            unit_id=complaint.unit_id,
            complaint=complaint,
            file=file,
            file_name=file.name,
            file_size=file.size,
            file_type=file.content_type,
        )


def _assign_complaint(complaint, *, organization, site, user_id, actor_user_id) -> None:
    if not user_id:
        complaint.assigned_service_person_user_id = None
        complaint.assigned_service_person_name = ""
        complaint.assigned_by_user_id = None
        complaint.assigned_at = None
        return
    if str(complaint.assigned_service_person_user_id) == str(user_id):
        return
    name = _assignable_or_raise(organization=organization, site=site, user_id=user_id)
    complaint.assigned_service_person_user_id = user_id
    complaint.assigned_service_person_name = name
    complaint.assigned_by_user_id = actor_user_id
    complaint.assigned_at = timezone.now()


@tenant_atomic
def create_complaint(
    *,
    organization,
    site_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    can_manage: bool,
    assigned_user_id: uuid.UUID | None = None,
    attachment=None,
    files: list | None = None,
    **kwargs,
) -> Complaint:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    complaint = Complaint(
        unit_id=site.unit_id,  # the site's unit, not the person filing it
        site=site,
        complainant_user_id=actor_user_id,
        status=ComplaintStatus.OPEN,
        created_by_user_id=actor_user_id,
        **{k: kwargs[k] for k in _COMPLAINT_TEXT_FIELDS if k in kwargs},
    )
    if assigned_user_id:
        if not can_manage:
            raise AuthorizationError(
                "Only somebody who assigns complaints can choose who handles it."
            )
        _assign_complaint(
            complaint, organization=organization, site=site,
            user_id=assigned_user_id, actor_user_id=actor_user_id,
        )
    if attachment:
        complaint.attachment = attachment
    complaint.save()
    _attach_files(complaint, files)
    return complaint


@tenant_atomic
def update_complaint(
    *,
    organization,
    complaint_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    can_manage: bool,
    attachment=None,
    files: list | None = None,
    kept_attachment_ids: list | None = None,
    clear_attachment: bool = False,
    **kwargs,
) -> Complaint:
    """
    Edit what a complaint says, or who handles it. NOT ITS STATUS: that moves
    through `set_complaint_status`, which records who resolved it and how.
    """
    complaint = Complaint.objects.select_related("site").filter(id=complaint_id).first()
    if not complaint:
        raise not_found("Complaint")

    raised_it = str(complaint.complainant_user_id) == str(actor_user_id)
    if not (can_manage or raised_it):
        raise AuthorizationError("Only whoever raised this complaint, or a manager, can edit it.")

    for key in _COMPLAINT_TEXT_FIELDS:
        if key in kwargs:
            setattr(complaint, key, kwargs[key])
    if "assigned_user_id" in kwargs:
        if not can_manage:
            raise AuthorizationError(
                "Only somebody who assigns complaints can change who handles it."
            )
        _assign_complaint(
            complaint, organization=organization, site=complaint.site,
            user_id=kwargs["assigned_user_id"], actor_user_id=actor_user_id,
        )

    if attachment:
        complaint.attachment = attachment
    elif clear_attachment:
        complaint.attachment = ""
    complaint.updated_by_user_id = actor_user_id
    complaint.save()

    if kept_attachment_ids is not None:
        ReportAttachment.objects.filter(complaint=complaint).exclude(
            id__in=kept_attachment_ids
        ).delete()
    _attach_files(complaint, files)
    return complaint


#: Which status each one may move to, and who may move it there.
_COMPLAINT_MOVES = {
    ComplaintStatus.IN_PROGRESS: ({ComplaintStatus.OPEN}, "assignee"),
    ComplaintStatus.RESOLVED: ({ComplaintStatus.OPEN, ComplaintStatus.IN_PROGRESS}, "assignee"),
    ComplaintStatus.CLOSED: ({ComplaintStatus.RESOLVED}, "manager"),
    ComplaintStatus.OPEN: ({ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED}, "raiser"),
}


@tenant_atomic
def set_complaint_status(
    *,
    complaint_id: uuid.UUID,
    status: str,
    actor_user_id: uuid.UUID,
    can_manage: bool,
    notes: str = "",
) -> Complaint:
    """
    Move a complaint along. Start work and Resolve belong to the assigned
    person; Close (after checking) to a manager; Reopen to whoever raised it.
    A manager may do any of them. Resolving needs a note of what was done.
    """
    complaint = Complaint.objects.filter(id=complaint_id).first()
    if not complaint:
        raise not_found("Complaint")
    if status not in _COMPLAINT_MOVES:
        raise InvalidInputError(
            "Unknown status.",
            field_errors=[FieldError(field="status", code="invalid", detail="Unknown status.")],
        )

    allowed_from, who = _COMPLAINT_MOVES[status]
    if complaint.status not in allowed_from:
        raise ConflictError(
            code="complaint_status",
            message=(
                f"A {complaint.get_status_display().lower()} complaint cannot be moved to "
                f"{ComplaintStatus(status).label.lower()}."
            ),
        )
    is_assignee = str(complaint.assigned_service_person_user_id) == str(actor_user_id)
    raised_it = str(complaint.complainant_user_id) == str(actor_user_id)
    permitted = can_manage or (who == "assignee" and is_assignee) or (who == "raiser" and raised_it)
    if not permitted:
        raise AuthorizationError(
            {
                "assignee": "Only the person this complaint is assigned to can do that.",
                "manager": "Only a manager can close a complaint.",
                "raiser": "Only whoever raised this complaint, or a manager, can reopen it.",
            }[who]
        )

    if status == ComplaintStatus.RESOLVED:
        if not (notes or "").strip():
            raise InvalidInputError(
                "Say what was done to resolve it.",
                field_errors=[
                    FieldError(field="notes", code="required", detail="Say what was done.")
                ],
            )
        complaint.resolved_at = timezone.now()
        complaint.resolved_by_user_id = actor_user_id
        complaint.resolution_notes = notes.strip()
    elif status == ComplaintStatus.OPEN:
        complaint.resolved_at = None
        complaint.resolved_by_user_id = None

    complaint.status = status
    complaint.updated_by_user_id = actor_user_id
    complaint.save()
    return complaint


@tenant_atomic
def delete_complaint(*, complaint_id: uuid.UUID) -> None:
    Complaint.objects.filter(id=complaint_id).delete()
