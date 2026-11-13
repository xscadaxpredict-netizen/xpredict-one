from __future__ import annotations

from django.core.files.uploadedfile import UploadedFile

from .feasibility_engine import calculate_reclaimer_feasibility
from .models import (
    ECDosingCalculation,
    FeasibilityAttachment,
    FeasibilityLineItem,
    FeasibilityReport,
    MarketingAsset,
    TimerCalculation,
)


def create_marketing_asset(
    *, title: str, material_type: str, category: str = "", description: str = "",
    file: UploadedFile, duration: str = "", resolution: str = "", format: str = ""
) -> MarketingAsset:
    asset = MarketingAsset(
        title=title,
        material_type=material_type,
        category=category,
        description=description,
        file=file,
        file_name=file.name,
        file_size=f"{file.size / (1024 * 1024):.2f} MB",
        duration=duration,
        resolution=resolution,
        format=format
    )
    asset.save()
    return asset

def delete_marketing_asset(asset_id: str) -> None:
    MarketingAsset.objects.filter(id=asset_id).delete()

def create_timer_calculation(
    *,
    site_id: str,
    input_data: dict,
    output_data: dict,
) -> TimerCalculation:
    calc = TimerCalculation(
        site_id=site_id,
        input_data=input_data,
        output_data=output_data
    )
    calc.save()
    return calc

def delete_timer_calculation(calc_id: str) -> None:
    TimerCalculation.objects.filter(id=calc_id).delete()


def get_standard_line_items_seed(
    capacity_kld: float = 15.0, model_name: str = "HIDREC EZ 1000"
) -> list[dict]:
    """Returns default quotation equipment line items."""
    ec_price = 485000.0 if capacity_kld <= 25.0 else 750000.0
    filter_price = 165000.0 if capacity_kld <= 25.0 else 240000.0
    pump_price = 85000.0 if capacity_kld <= 25.0 else 125000.0
    return [
        {
            "item_name": (
                f"{model_name} Electrocoagulation "
                "Reactor Chamber & SMPS Power "
                "Electronics"
            ),
            "specification": (
                "SS304 skid, quick-change sacrificial "
                "electrode pack, polarity-reversal "
                "automation"
            ),
            "quantity": 1,
            "unit": "Lot",
            "unit_price": ec_price,
            "display_order": 1,
        },
        {
            "item_name": "Dual Media Sand & Activated Carbon Pressure Filter System",
            "specification": (
                "FRP vessel, multi-port valve, "
                "multi-grade silica sand & high-iodine "
                "carbon"
            ),
            "quantity": 1,
            "unit": "Set",
            "unit_price": filter_price,
            "display_order": 2,
        },
        {
            "item_name": "Raw Sewage Feed Pump & Motorized Actuator Valves Package",
            "specification": (
                "Non-clog submersible pump, motorized 24V "
                "DC actuator valves with fail-safe return"
            ),
            "quantity": 1,
            "unit": "Lot",
            "unit_price": pump_price,
            "display_order": 3,
        },
    ]


DEFAULT_XPREDICT_SCOPE = [
    "Process engineering, equipment sizing, design calculations, and complete P&ID drawings.",
    (
        "Manufacturing and supply of skid-mounted Electrocoagulation Reactor Chamber with "
        "quick-change electrode pack."
    ),
    (
        "Supply of high-frequency switched-mode DC power supply unit (SMPS) with "
        "polarity-reversal automation."
    ),
    (
        "Supply of tertiary filtration system including FRP vessels, multi-grade media, and "
        "multiport control valves."
    ),
    (
        "Plant testing, wet commissioning, and hands-on operational training for client facility "
        "staff."
    ),
]

DEFAULT_CLIENT_SCOPE = [
    (
        "Civil construction of collection sump, raw water holding tanks, and treated water clear "
        "well as per engineering layouts."
    ),
    (
        "Three-phase 415V, 50Hz electrical power termination with dedicated MCCB/ELCB isolator at "
        "plant battery limits."
    ),
    (
        "Inlet sewage raw water piping up to plant skid and treated water distribution pumping "
        "from clear well."
    ),
    (
        "Protected weather shed or well-ventilated plant room with adequate lighting and drainage "
        "floor sump."
    ),
]

DEFAULT_TERMS_CONDITIONS = [
    (
        "Payment: 50% advance along with confirmed Purchase Order, 40% against proforma invoice "
        "prior to dispatch, 10% after successful wet commissioning."
    ),
    (
        "Warranty: 12 months comprehensive warranty on all electro-mechanical components from the "
        "date of commissioning against manufacturing defects."
    ),
    (
        "Delivery: Equipment delivery within 4 to 6 weeks from the date of receipt of confirmed "
        "Purchase Order and advance payment."
    ),
    (
        "Validity: Commercial pricing and technical specifications remain valid for 30 days from "
        "the proposal submission date."
    ),
]


def create_feasibility_report(
    *,
    site_id: str | None = None,
    unit_id: str | None = None,
    proposal_number: str = "",
    site_name: str,
    site_location: str = "",
    project_title: str = "Waste Water Reclaimer Plant",
    proposed_model: str = "HIDREC EZ 1000",
    model_name: str | None = None,
    survey_date: str | None = None,
    capacity_kld: float = 15.0,
    operating_hours: float = 18.0,
    water_type: str = "Mixed Domestic Sewage",
    electrode_metal: str = "AL",
    target_dose_mg_l: float = 25.0,
    supply_voltage: float = 48.0,
    conductivity_us_cm: float = 2000.0,
    abstract: str = "",
    observations: list | None = None,
    design_parameters: dict | None = None,
    xpredict_scope: list | None = None,
    client_scope: list | None = None,
    terms_conditions: list | None = None,
    water_specs: dict | None = None,
    items: list | None = None,
    status: str = "DRAFT",
    **kwargs,
) -> FeasibilityReport:
    # Auto-calculate specifications using parametric engine
    calculated_specs = calculate_reclaimer_feasibility(
        capacity_kld=capacity_kld,
        operating_hours=operating_hours,
        electrode_metal=electrode_metal,
        target_dose_mg_l=target_dose_mg_l,
        supply_voltage=supply_voltage,
        conductivity_us_cm=conductivity_us_cm,
    )

    chosen_model = model_name or proposed_model or "HIDREC EZ 1000"

    report = FeasibilityReport(
        site_id=site_id,
        unit_id=unit_id,
        proposal_number=proposal_number,
        site_name=site_name,
        site_location=site_location,
        project_title=project_title,
        proposed_model=chosen_model,
        survey_date=survey_date,
        capacity_kld=capacity_kld,
        operating_hours=operating_hours,
        water_type=water_type,
        electrode_metal=electrode_metal,
        target_dose_mg_l=target_dose_mg_l,
        supply_voltage=supply_voltage,
        conductivity_us_cm=conductivity_us_cm,
        abstract=abstract,
        observations=observations or [],
        design_parameters=design_parameters or {},
        calculated_specs=calculated_specs,
        xpredict_scope=xpredict_scope or list(DEFAULT_XPREDICT_SCOPE),
        client_scope=client_scope or list(DEFAULT_CLIENT_SCOPE),
        terms_conditions=terms_conditions or list(DEFAULT_TERMS_CONDITIONS),
        water_specs=water_specs or {},
        status=status,
    )
    report.save()

    # Create quotation equipment line items
    raw_items = (
        items if items is not None else get_standard_line_items_seed(capacity_kld, chosen_model)
    )
    for idx, item in enumerate(raw_items, start=1):
        FeasibilityLineItem.objects.create(
            report=report,
            item_name=item.get("item_name", f"Equipment Item #{idx}"),
            specification=item.get("specification", ""),
            quantity=item.get("quantity", 1),
            unit=item.get("unit", "Lot"),
            unit_price=item.get("unit_price", 0.0),
            display_order=item.get("display_order", idx),
        )

    return report


def update_feasibility_report(
    report_id: str,
    **fields,
) -> FeasibilityReport:
    report = FeasibilityReport.objects.filter(id=report_id).first()
    if not report:
        raise ValueError("Feasibility report not found")

    items_data = fields.pop("items", None)
    fields.pop("template", None)
    fields.pop("template_id", None)
    if "model_name" in fields and not fields.get("proposed_model"):
        fields["proposed_model"] = fields["model_name"]

    for key, val in fields.items():
        if hasattr(report, key) and val is not None:
            setattr(report, key, val)

    # Re-calculate specs
    report.calculated_specs = calculate_reclaimer_feasibility(
        capacity_kld=report.capacity_kld,
        operating_hours=report.operating_hours,
        electrode_metal=report.electrode_metal,
        target_dose_mg_l=report.target_dose_mg_l,
        supply_voltage=report.supply_voltage,
        conductivity_us_cm=report.conductivity_us_cm,
    )
    report.save()

    # Synchronize line items if provided
    if items_data is not None:
        report.items.all().delete()
        for idx, item in enumerate(items_data, start=1):
            FeasibilityLineItem.objects.create(
                report=report,
                item_name=item.get("item_name", f"Equipment Item #{idx}"),
                specification=item.get("specification", ""),
                quantity=item.get("quantity", 1),
                unit=item.get("unit", "Lot"),
                unit_price=item.get("unit_price", 0.0),
                display_order=item.get("display_order", idx),
            )

    return report


def delete_feasibility_report(report_id: str) -> None:
    FeasibilityReport.objects.filter(id=report_id).delete()


def create_feasibility_attachment(
    *,
    report_id: str,
    category: str,
    title: str,
    file: UploadedFile,
    caption: str = "",
) -> FeasibilityAttachment:
    attachment = FeasibilityAttachment(
        report_id=report_id,
        category=category,
        title=title,
        file=file,
        file_name=file.name,
        file_size=f"{file.size / (1024 * 1024):.2f} MB",
        caption=caption,
    )
    attachment.save()
    return attachment


def delete_feasibility_attachment(attachment_id: str) -> None:
    FeasibilityAttachment.objects.filter(id=attachment_id).delete()


def create_ec_calculation(
    *,
    unit_id: str | None = None,
    site_id: str | None = None,
    site_name: str = "",
    title: str = "EC Dosing Calculation",
    calculation_mode: str = "TIME_FROM_DOSE",
    machine_model: str = "CUSTOM",
    metal_type: str = "AL",
    water_type: str = "",
    input_params: dict,
    output_params: dict,
    notes: str = "",
    created_by_user_id: str | None = None,
) -> ECDosingCalculation:
    return ECDosingCalculation.objects.create(
        unit_id=unit_id,
        site_id=site_id,
        site_name=site_name,
        title=title,
        calculation_mode=calculation_mode,
        machine_model=machine_model,
        metal_type=metal_type,
        water_type=water_type,
        input_params=input_params,
        output_params=output_params,
        notes=notes,
        created_by_user_id=created_by_user_id,
    )


def delete_ec_calculation(calculation_id: str) -> None:
    ECDosingCalculation.objects.filter(id=calculation_id).delete()
