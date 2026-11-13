from django.urls import path

from .views import (
    CalculatorSettingsView,
    ECDosingCalculationDetailView,
    ECDosingCalculationListView,
    FeasibilityAttachmentDetailView,
    FeasibilityAttachmentView,
    FeasibilityCalculateLiveView,
    FeasibilityReportDetailView,
    FeasibilityReportListView,
    FeasibilityTemplateView,
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

    # EC Dosing & HRT calculation endpoints
    path("ec-calculations/", ECDosingCalculationListView.as_view(), name="ec-calculation-list"),
    path("ec-calculations/<uuid:pk>/", ECDosingCalculationDetailView.as_view(), name="ec-calculation-detail"),

    # Feasibility endpoints
    path("feasibility/template/", FeasibilityTemplateView.as_view(), name="feasibility-template"),
    path("feasibility/calculate/", FeasibilityCalculateLiveView.as_view(), name="feasibility-calculate-live"),
    path("feasibility/reports/", FeasibilityReportListView.as_view(), name="feasibility-report-list"),
    path("feasibility/reports/<uuid:pk>/", FeasibilityReportDetailView.as_view(), name="feasibility-report-detail"),
    path("feasibility/reports/<uuid:pk>/attachments/", FeasibilityAttachmentView.as_view(), name="feasibility-attachment-list"),
    path(
        "feasibility/reports/<uuid:pk>/attachments/<uuid:attachment_id>/",
        FeasibilityAttachmentDetailView.as_view(),
        name="feasibility-attachment-detail",
    ),
]

