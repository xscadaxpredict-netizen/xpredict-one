from django.urls import path

from .views import (
    CalculatorSettingsView,
    MarketingAssetDetailView,
    MarketingAssetListView,
    TimerCalculationDetailView,
    TimerCalculationListView,
)

urlpatterns = [
    path("marketing/", MarketingAssetListView.as_view(), name="marketing-asset-list"),
    path("marketing/<uuid:pk>/", MarketingAssetDetailView.as_view(), name="marketing-asset-detail"),

    path("calculations/", TimerCalculationListView.as_view(), name="timer-calculation-list"),
    path(
        "calculations/<uuid:pk>/",
        TimerCalculationDetailView.as_view(),
        name="timer-calculation-detail",
    ),

    path("calculator-settings/", CalculatorSettingsView.as_view(), name="calculator-settings"),
]
