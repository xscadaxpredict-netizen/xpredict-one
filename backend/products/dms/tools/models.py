"""
Tools models: MarketingAsset, TimerCalculation.

MarketingAsset inherits ``BaseModel`` (org-level, no unit_id) — same
reasoning as UserManual and MachineVideo (schema review #04).

TimerCalculation inherits ``UnitScopedModel`` — saved per-site by a
dealer's technician.
"""

from __future__ import annotations

from django.db import models

from shared.base_models import BaseModel, UnitScopedModel


# ============================================================================
# MarketingAsset
# ============================================================================

class MarketingAsset(BaseModel):
    """
    Marketing materials (brochures, videos, ad banners) available to all
    dealers within an organisation.

    Frontend ref: Brochure, Video, AdBanner interfaces — title, category,
    fileName, fileSize, description, format, duration, resolution.
    UploadMaterialDialog — title, type, file.
    """

    MATERIAL_TYPES = [
        ("BROCHURE", "Brochure"),
        ("VIDEO", "Video"),
        ("AD", "Ad Banner"),
    ]

    title = models.CharField(max_length=255)
    material_type = models.CharField(max_length=20, choices=MATERIAL_TYPES)
    category = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    file = models.FileField(upload_to="tools/marketing/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_size = models.CharField(max_length=50, blank=True, default="")
    # For videos.
    duration = models.CharField(max_length=20, blank=True, default="")
    resolution = models.CharField(max_length=20, blank=True, default="")
    # For ad banners.
    format = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["material_type"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_material_type_display()}: {self.title}"


# ============================================================================
# TimerCalculation
# ============================================================================

class TimerCalculation(UnitScopedModel):
    """
    A saved capacity/timer calculation for a specific site.

    Frontend ref: CapacityInput — application, flowRate, tds, temperature.
    CapacityResult — membraneCount, vesselCount, pumpPower, recoveryRate,
    systemType.

    Both input and output are stored as JSON for maximum flexibility — the
    calculation formulas may evolve without requiring migrations.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="timer_calculations",
    )
    input_data = models.JSONField(default=dict)
    output_data = models.JSONField(default=dict)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "site_id"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Calculation for site {self.site_id}"
