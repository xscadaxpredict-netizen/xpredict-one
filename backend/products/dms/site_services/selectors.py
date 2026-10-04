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
from typing import Optional
from django.db.models import QuerySet

from products.dms.sales.models import ConfirmedSite, Quotation
from .models import ServiceSchedule, ServiceReport, WaterReport, Complaint, SiteServiceProfile
from .exceptions import not_found


def list_sites() -> QuerySet[ConfirmedSite]:
    return ConfirmedSite.objects.filter(is_active=True).select_related(
        "service_profile", "customer", "confirmed_quote"
    ).prefetch_related(
        "quotations", # for AMC quotes
    ).order_by("-created_at")


def get_site(site_id: uuid.UUID) -> ConfirmedSite:
    site = list_sites().filter(id=site_id).first()
    if not site:
        raise not_found("Site")
    return site


def list_schedules(site_id: Optional[uuid.UUID] = None) -> QuerySet[ServiceSchedule]:
    qs = ServiceSchedule.objects.all().order_by("scheduled_date")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_schedule(schedule_id: uuid.UUID) -> ServiceSchedule:
    schedule = ServiceSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        raise not_found("Service Schedule")
    return schedule


def list_service_reports(site_id: Optional[uuid.UUID] = None) -> QuerySet[ServiceReport]:
    qs = ServiceReport.objects.prefetch_related("attachments").order_by("-service_date")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_service_report(report_id: uuid.UUID) -> ServiceReport:
    report = ServiceReport.objects.filter(id=report_id).prefetch_related("attachments").first()
    if not report:
        raise not_found("Service Report")
    return report


def list_water_reports(site_id: Optional[uuid.UUID] = None) -> QuerySet[WaterReport]:
    qs = WaterReport.objects.all().order_by("-date_tested")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_water_report(report_id: uuid.UUID) -> WaterReport:
    report = WaterReport.objects.filter(id=report_id).first()
    if not report:
        raise not_found("Water Report")
    return report


def list_complaints(site_id: Optional[uuid.UUID] = None) -> QuerySet[Complaint]:
    qs = Complaint.objects.all().order_by("-created_at")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_complaint(complaint_id: uuid.UUID) -> Complaint:
    complaint = Complaint.objects.filter(id=complaint_id).first()
    if not complaint:
        raise not_found("Complaint")
    return complaint
