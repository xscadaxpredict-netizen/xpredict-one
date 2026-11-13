from __future__ import annotations

from typing import Any

from django.contrib import admin

from config.routers import current_tenant_db
from core.organizations.models import Organization
from core.organizations.tenancy import register_tenant_connection
from products.dms.tools.models import (
    CalculatorSettings,
    FeasibilityAttachment,
    FeasibilityLineItem,
    FeasibilityReport,
    MarketingAsset,
    TimerCalculation,
)


class TenantAwareModelAdmin(admin.ModelAdmin):
    """
    Ensures that queries from Django admin for tenant models route to the active tenant database.
    Supports selecting an organization via `?org=<slug>`, or defaults to the first
    active organization.
    """

    def _bind_tenant(self, request: Any):
        org_slug = request.GET.get("org") or request.session.get("admin_tenant_org")
        org = None
        if org_slug:
            org = Organization.objects.using("default").filter(slug=org_slug).first()
        if not org:
            org = Organization.objects.using("default").filter(status="active").first()
        if org:
            alias = register_tenant_connection(org)
            token = current_tenant_db.set(alias)
            return token, org
        return None, None

    def changelist_view(self, request: Any, extra_context: dict[str, Any] | None = None):
        token, org = self._bind_tenant(request)
        try:
            extra = extra_context or {}
            if org:
                extra["current_tenant_name"] = org.name
                extra["current_tenant_db"] = org.db_name
            return super().changelist_view(request, extra_context=extra)
        finally:
            if token:
                current_tenant_db.reset(token)

    def changeform_view(
        self,
        request: Any,
        object_id: str | None = None,
        form_url: str = "",
        extra_context: dict[str, Any] | None = None,
    ):
        token, _org = self._bind_tenant(request)
        try:
            return super().changeform_view(request, object_id, form_url, extra_context)
        finally:
            if token:
                current_tenant_db.reset(token)

    def delete_view(
        self, request: Any, object_id: str, extra_context: dict[str, Any] | None = None
    ):
        token, _org = self._bind_tenant(request)
        try:
            return super().delete_view(request, object_id, extra_context)
        finally:
            if token:
                current_tenant_db.reset(token)

    def history_view(
        self, request: Any, object_id: str, extra_context: dict[str, Any] | None = None
    ):
        token, _org = self._bind_tenant(request)
        try:
            return super().history_view(request, object_id, extra_context)
        finally:
            if token:
                current_tenant_db.reset(token)


class FeasibilityLineItemInline(admin.TabularInline):
    model = FeasibilityLineItem
    extra = 1
    fields = (
        "item_name",
        "specification",
        "quantity",
        "unit",
        "unit_price",
        "total_price",
        "display_order",
    )
    readonly_fields = ("total_price",)


@admin.register(FeasibilityReport)
class FeasibilityReportAdmin(TenantAwareModelAdmin):
    list_display = (
        "proposal_number",
        "proposed_model",
        "site_name",
        "capacity_kld",
        "operating_hours",
        "status",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("proposal_number", "proposed_model", "site_name", "site_location")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (FeasibilityLineItemInline,)


@admin.register(FeasibilityLineItem)
class FeasibilityLineItemAdmin(TenantAwareModelAdmin):
    list_display = (
        "report",
        "item_name",
        "quantity",
        "unit",
        "unit_price",
        "total_price",
        "display_order",
    )
    list_filter = ("unit", "created_at")
    search_fields = ("item_name", "specification", "report__site_name")
    readonly_fields = ("id", "total_price", "created_at", "updated_at")


@admin.register(FeasibilityAttachment)
class FeasibilityAttachmentAdmin(TenantAwareModelAdmin):
    list_display = (
        "report",
        "category",
        "title",
        "file_name",
        "created_at",
    )
    list_filter = ("category", "created_at")
    search_fields = ("title", "file_name", "caption")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(CalculatorSettings)
class CalculatorSettingsAdmin(TenantAwareModelAdmin):
    list_display = ("id", "created_at", "updated_at")
    list_filter = ("created_at",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(TimerCalculation)
class TimerCalculationAdmin(TenantAwareModelAdmin):
    list_display = (
        "id",
        "site",
        "unit_id",
        "created_at",
    )
    list_filter = ("created_at",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MarketingAsset)
class MarketingAssetAdmin(TenantAwareModelAdmin):
    list_display = ("title", "material_type", "category", "file_name", "created_at")
    list_filter = ("material_type", "category", "created_at")
    search_fields = ("title", "description", "file_name")
    readonly_fields = ("id", "created_at", "updated_at")
