"""
Read logic for Service.

Queries live here rather than in views, so a list endpoint, an export and a
dashboard tile all share one definition of "the enquiries this user may see".

Unit scoping is not applied here by hand. Service models inherit from
`UnitScopedModel`, whose default manager filters by the `allowed_units`
contextvar --- so `Model.objects` is already scoped to the caller's dealer.
Use `Model.all_units` only for deliberate fleet-wide reporting, and justify it.
"""

from __future__ import annotations

import uuid

from django.db.models import Max, Q, QuerySet

from products.dms.sales.models import ConfirmedSite, EnquiryStatus

from .exceptions import not_found
from .models import Complaint, ServiceReport, ServiceSchedule, WaterReport


def list_sites() -> QuerySet[ConfirmedSite]:
    return ConfirmedSite.objects.filter(
        is_active=True,
        enquiry__status=EnquiryStatus.CONFIRMED,
    ).select_related(
        "service_profile", "customer", "confirmed_quote", "enquiry"
    ).prefetch_related(
        "quotations",  # for AMC quotes
    ).annotate(
        # The last visit actually done, from signed service reports --- the
        # Deployed Sites table counts the next service date from it.
        last_service_report_date=Max("service_reports__service_date"),
    ).order_by("-created_at")


def get_site(site_id: uuid.UUID) -> ConfirmedSite:
    site = list_sites().filter(id=site_id).first()
    if not site:
        raise not_found("Site")
    return site


def list_schedules(
    site_id: uuid.UUID | None = None,
    *,
    technician_user_id: uuid.UUID | None = None,
) -> QuerySet[ServiceSchedule]:
    """
    Visits, earliest first. `technician_user_id` narrows to one person's own
    visits -- the "My visits" view for somebody who does not manage visits.
    Dealer isolation already applies through UnitScopedModel.
    """
    qs = ServiceSchedule.objects.select_related("service_report").order_by(
        "scheduled_date", "scheduled_time"
    )
    if site_id:
        qs = qs.filter(site_id=site_id)
    if technician_user_id is not None:
        qs = qs.filter(technician_user_id=technician_user_id)
    return qs


def get_schedule(schedule_id: uuid.UUID) -> ServiceSchedule:
    schedule = ServiceSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        raise not_found("Service Schedule")
    return schedule


def list_service_reports(site_id: uuid.UUID | None = None) -> QuerySet[ServiceReport]:
    qs = ServiceReport.objects.prefetch_related("attachments").order_by("-service_date")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_service_report(report_id: uuid.UUID) -> ServiceReport:
    report = ServiceReport.objects.filter(id=report_id).prefetch_related("attachments").first()
    if not report:
        raise not_found("Service Report")
    return report


def list_water_reports(site_id: uuid.UUID | None = None) -> QuerySet[WaterReport]:
    qs = WaterReport.objects.all().order_by("-date_tested")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_water_report(report_id: uuid.UUID) -> WaterReport:
    report = WaterReport.objects.filter(id=report_id).first()
    if not report:
        raise not_found("Water Report")
    return report


def list_complaints(
    site_id: uuid.UUID | None = None,
    *,
    only_for_user_id: uuid.UUID | None = None,
) -> QuerySet[Complaint]:
    """
    Complaints, newest first. `only_for_user_id` narrows to the ones that
    person is handling or raised -- the view for somebody who does not manage
    complaints. Dealer isolation already applies through UnitScopedModel.
    """
    qs = Complaint.objects.all().order_by("-created_at")
    if site_id:
        qs = qs.filter(site_id=site_id)
    if only_for_user_id is not None:
        qs = qs.filter(
            Q(assigned_service_person_user_id=only_for_user_id)
            | Q(complainant_user_id=only_for_user_id)
        )
    return qs


def get_complaint(complaint_id: uuid.UUID) -> Complaint:
    complaint = Complaint.objects.filter(id=complaint_id).first()
    if not complaint:
        raise not_found("Complaint")
    return complaint
