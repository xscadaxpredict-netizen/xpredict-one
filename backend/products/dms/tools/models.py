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


# capacity calculator models

class CalculatorSettings(BaseModel):
    """
    Organization-level master data constants for the Capacity Calculator and
    Electrocoagulation (EC) Dosing & HRT sizing.
    Stored as JSON so we can easily add new constants without database migrations.
    """
    constants = models.JSONField(default=dict)
    ec_constants = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["-created_at"]),
        ]


# ============================================================================
# Electrocoagulation (EC) Dosing & HRT Calculations (Saved Site Runs)
# ============================================================================

class ECDosingCalculation(UnitScopedModel):
    """
    Saved Electrocoagulation (EC) Dosing and Hydraulic Retention Time (HRT)
    calculation for a site or field bench test.
    """
    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ec_calculations",
    )
    site_name = models.CharField(max_length=255, blank=True, default="")
    title = models.CharField(max_length=255, default="EC Dosing Calculation")
    calculation_mode = models.CharField(max_length=40, default="TIME_FROM_DOSE")
    machine_model = models.CharField(max_length=50, default="CUSTOM")
    metal_type = models.CharField(max_length=10, default="AL")
    water_type = models.CharField(max_length=100, blank=True, default="")
    input_params = models.JSONField(default=dict)
    output_params = models.JSONField(default=dict)
    notes = models.TextField(blank=True, default="")
    created_by_user_id = models.UUIDField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "-created_at"]),
            models.Index(fields=["unit_id", "site_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.machine_model} - {self.metal_type})"


# ============================================================================
# Feasibility Proposal (Quotation Style) - EXACTLY 3 TABLES
# 1. FeasibilityReport (Proposal Header & Scopes)
# 2. FeasibilityLineItem (Commercial Quotation Line Items)
# 3. FeasibilityAttachment (Multi-Sheet Drawings & Photos)
# ============================================================================

class FeasibilityReport(BaseModel):
    """
    Dynamic Feasibility Study & Quotation for Waste Water Reclaimer Plants.
    Can be linked to a ConfirmedSite or entered custom for prospective customer sites.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feasibility_reports",
    )
    unit_id = models.UUIDField(null=True, blank=True, db_index=True)
    proposal_number = models.CharField(max_length=50, blank=True, default="")
    site_name = models.CharField(max_length=255)
    site_location = models.CharField(max_length=255, blank=True, default="")
    project_title = models.CharField(max_length=255, default="Waste Water Reclaimer Plant")
    proposed_model = models.CharField(max_length=100, default="HIDREC EZ 1000")
    survey_date = models.DateField(null=True, blank=True)
    capacity_kld = models.FloatField(default=15.0)
    operating_hours = models.FloatField(default=18.0)
    water_type = models.CharField(max_length=100, default="Mixed Domestic Sewage")
    electrode_metal = models.CharField(max_length=10, default="AL")
    target_dose_mg_l = models.FloatField(default=25.0)
    supply_voltage = models.FloatField(default=48.0)
    conductivity_us_cm = models.FloatField(default=2000.0)
    abstract = models.TextField(blank=True, default="")
    observations = models.JSONField(default=list)
    design_parameters = models.JSONField(default=dict)
    calculated_specs = models.JSONField(default=dict)
    xpredict_scope = models.JSONField(default=list)
    client_scope = models.JSONField(default=list)
    terms_conditions = models.JSONField(default=list)
    water_specs = models.JSONField(default=dict)
    status = models.CharField(
        max_length=20,
        default="DRAFT",
        choices=[("DRAFT", "Draft"), ("FINAL", "Finalized"), ("ARCHIVED", "Archived")],
    )

    class Meta:
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["site_name"]),
            models.Index(fields=["status"]),
            models.Index(fields=["proposal_number"]),
        ]

    def __str__(self) -> str:
        return f"{self.proposed_model} - {self.site_name} ({self.capacity_kld} KLD)"

    @property
    def model_name(self) -> str:
        return self.proposed_model

    @model_name.setter
    def model_name(self, value: str) -> None:
        self.proposed_model = value


class FeasibilityLineItem(BaseModel):
    """
    Quotation-style commercial equipment line items for a Feasibility Proposal.
    Snapshots equipment, specifications, quantity, unit rates, and totals.
    """

    report = models.ForeignKey(
        FeasibilityReport,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_name = models.CharField(max_length=255)
    specification = models.TextField(blank=True, default="")
    quantity = models.PositiveIntegerField(default=1)
    unit = models.CharField(max_length=30, default="Lot")
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["report_id", "display_order"]),
            models.Index(fields=["-created_at"]),
        ]

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.item_name} (x{self.quantity}) - {self.total_price}"


# Aliases for Quotation terminology
FeasibilityProposal = FeasibilityReport
FeasibilityProposalItem = FeasibilityLineItem



class FeasibilityAttachment(BaseModel):
    """
    Uploadable process diagrams (P&ID), electrical single-line drawings,
    jar test photos, site installation photos, and NABL water test reports.
    """

    CATEGORY_CHOICES = [
        ("OVERALL_PROCESS_FLOW", "Overall Process Diagram (Page 4)"),
        ("PROCESS_DIAGRAM", "Process Flow Diagram (Appendix A)"),
        ("ELECTRICAL_DIAGRAM", "Electrical Schematic (Appendix B)"),
        ("WATER_BEFORE_AFTER", "Water Quality Before/After Photo"),
        ("INSTALLATION_PHOTO", "Site Installation Photo (Appendix C)"),
        ("NABL_REPORT", "NABL Lab Test Report"),
        ("OTHER", "Other Attachment"),
    ]

    report = models.ForeignKey(
        FeasibilityReport,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default="OTHER")
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to="tools/feasibility/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_size = models.CharField(max_length=50, blank=True, default="")
    caption = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["report_id", "category"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_category_display()}: {self.title}"


