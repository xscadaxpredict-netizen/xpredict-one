from __future__ import annotations

from django.db.models import QuerySet

from .feasibility_engine import get_master_template_seed_data
from .models import (
    ECDosingCalculation,
    FeasibilityAttachment,
    FeasibilityReport,
    MarketingAsset,
    TimerCalculation,
)


def get_active_feasibility_template(water_type: str | None = None) -> dict:
    """
    Returns standard default proposal content without requiring a separate database table.
    """
    return get_master_template_seed_data()


def get_marketing_assets() -> QuerySet[MarketingAsset]:
    return MarketingAsset.objects.all().order_by("-created_at")

def get_timer_calculations() -> QuerySet[TimerCalculation]:
    return TimerCalculation.objects.all().order_by("-created_at")


def get_feasibility_reports() -> QuerySet[FeasibilityReport]:
    return FeasibilityReport.objects.all().prefetch_related("attachments").order_by("-created_at")


def get_feasibility_report(report_id: str) -> FeasibilityReport | None:
    return FeasibilityReport.objects.filter(id=report_id).prefetch_related("attachments").first()


def get_feasibility_attachments(report_id: str) -> QuerySet[FeasibilityAttachment]:
    return FeasibilityAttachment.objects.filter(report_id=report_id).order_by("-created_at")


def get_ec_calculations(unit_id: str | None = None) -> QuerySet[ECDosingCalculation]:
    qs = ECDosingCalculation.objects.all().select_related("site")
    if unit_id:
        qs = qs.filter(unit_id=unit_id)
    return qs.order_by("-created_at")


def get_ec_calculation(calculation_id: str) -> ECDosingCalculation | None:
    return ECDosingCalculation.objects.filter(id=calculation_id).select_related("site").first()


