from __future__ import annotations

from django.db.models import QuerySet

from .models import MarketingAsset, TimerCalculation


def get_marketing_assets() -> QuerySet[MarketingAsset]:
    return MarketingAsset.objects.all().order_by("-created_at")

def get_timer_calculations() -> QuerySet[TimerCalculation]:
    return TimerCalculation.objects.all().order_by("-created_at")
