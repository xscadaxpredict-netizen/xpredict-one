"""
Feasibility & Electrocoagulation Engineering Calculation Engine.

Implements all parametric calculations from XpredictLabs Waste Water Reclaimer Plant
feasibility models (Faraday's Law, Hydraulic Retention Times, Sizing, Electrical Energy).
"""

from __future__ import annotations

import math
from typing import Any, Dict


def calculate_reclaimer_feasibility(
    *,
    capacity_kld: float = 15.0,
    operating_hours: float = 18.0,
    electrode_metal: str = "AL",  # "AL" or "FE"
    target_dose_mg_l: float = 25.0,
    supply_voltage: float = 48.0,
    raw_bod: float = 220.0,
    treated_bod: float = 10.0,
    raw_cod: float = 350.0,
    treated_cod: float = 50.0,
    raw_tss: float = 300.0,
    treated_tss: float = 20.0,
    raw_tds: float = 1100.0,
    treated_tds: float = 1100.0,
    conductivity_us_cm: float = 2000.0,
) -> Dict[str, Any]:
    """
    Computes all engineering equipment sizes, chemical dosing, electrode lifespans,
    pumps, civil footprints, and power metrics dynamically based on capacity and site inputs.
    """
    # 1. Hydraulics
    op_hours = max(operating_hours, 1.0)
    flow_m3_hr = capacity_kld / op_hours
    flow_lph = flow_m3_hr * 1000.0

    # Continuous peak allowance (~15-20%)
    design_flow_lph = round(flow_lph * 1.15, 0)
    design_flow_m3_hr = round(design_flow_lph / 1000.0, 2)

    # 2. Bar Screen Chamber
    # Standard sizing based on design flow
    bar_screen_width_m = 0.6
    bar_screen_depth_m = 0.6
    bar_screen_length_m = 1.0

    # 3. Raw Water Tanks (Pre-Aeration & Equalization - Tanks 1 & 2)
    # Retention time = 3.0 hours during average flow
    tank_retention_hrs = 3.0
    tank_liquid_vol_m3 = round(flow_m3_hr * tank_retention_hrs, 2)
    # Recommended modular civil tank size with freeboard
    tank_width_mm = 1600
    tank_length_mm = 1600
    tank_depth_mm = 2500  # 2.3m SWD (Side Water Depth) + 0.2m freeboard
    modular_tank_vol_m3 = round((tank_width_mm / 1000.0) * (tank_length_mm / 1000.0) * (tank_depth_mm / 1000.0), 1)

    # Aeration & Oxygen Demand for 30% biological reduction in pre-aeration
    bod_reduction_ratio = 0.30
    bod_removed_kg_day = (capacity_kld * (raw_bod - treated_bod) * bod_reduction_ratio) / 1000.0
    # Rule of thumb: 2.0 kg O2 per kg BOD removed
    o2_required_kg_day = round(bod_removed_kg_day * 2.0, 2)
    air_required_m3_hr = round(max(o2_required_kg_day * 1.1, 4.0), 1)

    # Diffusers (EPDM Fine Bubble Tubular Diffuser, 1m length passes ~8 m3/hr)
    diffusers_count = max(2, math.ceil(air_required_m3_hr / 8.0))

    # 4. Raw Sewage Pump
    # Lift pump sized for ~1.0 - 1.5 x hourly flow at 2m head
    pump_flow_m3_hr = max(1.0, round(flow_m3_hr * 1.2, 1))
    raw_pump_power_w = 45 if flow_m3_hr <= 1.5 else (90 if flow_m3_hr <= 3.0 else 150)

    # 5. Electrocoagulation (EC) Chamber
    # Continuous flow system with HRT of 10 minutes
    ec_hrt_min = 10.0
    ec_active_volume_l = round(flow_lph * (ec_hrt_min / 60.0), 1)
    # Practical allowance (conical bottom concentrate zone, overflow, mechanical fixtures)
    ec_fixture_allowance_l = 100.0 if capacity_kld <= 25.0 else 200.0
    ec_total_reactor_vol_l = round(ec_active_volume_l + ec_fixture_allowance_l, 0)
    ec_total_reactor_vol_m3 = round(ec_total_reactor_vol_l / 1000.0, 3)

    # Electrochemistry & Faraday's Law
    # Al: z = 3, M = 26.98 g/mol | Fe: z = 2, M = 55.85 g/mol
    is_al = (electrode_metal.upper() == "AL")
    z = 3 if is_al else 2
    molar_mass = 26.98 if is_al else 55.85
    faraday_f = 96485.0  # Coulombs/mol

    # Required current to deliver target dose (mg/L = g/m3)
    # m_rate = I * M / (z * F) => I = (m_rate * z * F) / M
    # where m_rate is g/sec = (Dose_g_m3 * Flow_m3_hr) / 3600
    mass_rate_g_sec = (target_dose_mg_l * flow_m3_hr) / 3600.0
    required_current_amps = round((mass_rate_g_sec * z * faraday_f) / molar_mass, 1)

    # Safe operating current (practical cell current considering ~80% faradaic efficiency)
    actual_cell_current_amps = round(required_current_amps / 0.85, 1)

    # Electrode sizing & current density
    # Target current density J ~ 8 to 25 A/m2 for wastewater
    plate_width_m = 0.40
    plate_height_m = 1.00
    plate_thickness_m = 0.008  # 8mm plates
    plate_face_area_m2 = 2 * (plate_width_m * plate_height_m)
    
    # Calculate required active plate count (minimum 4 plates)
    plate_count = max(4, math.ceil(actual_cell_current_amps / (plate_face_area_m2 * 12.0)))
    total_anode_area_m2 = round((plate_count / 2) * plate_face_area_m2, 2)
    current_density_a_m2 = round(actual_cell_current_amps / total_anode_area_m2, 2)

    # Electrode dissolution and life calculation
    # Daily dissolved mass (kg/day) = (target_dose_mg_l * capacity_kld) / 1000
    daily_dissolution_kg = round((target_dose_mg_l * capacity_kld) / 1000.0, 3)
    # Cell pack initial mass: ~5 kg per plate for Al, ~15 kg per plate for Fe
    plate_unit_weight_kg = 5.0 if is_al else 14.5
    total_electrode_pack_weight_kg = round(plate_count * plate_unit_weight_kg, 1)
    
    # Usable electrode consumption before replacement (~60% usable before structural degradation)
    usable_metal_kg = total_electrode_pack_weight_kg * 0.60
    days_to_replacement = round(usable_metal_kg / max(daily_dissolution_kg, 0.001), 0)
    months_to_replacement = round(days_to_replacement / 30.0, 1)

    # Specific Electrical Energy Consumption (EC = U * I * t / V in kWh/m3)
    # Power = U * I (Watts) -> kWh per hour = (U * I) / 1000
    operating_power_kw = round((supply_voltage * actual_cell_current_amps) / 1000.0, 2)
    specific_energy_kwh_m3 = round(operating_power_kw / max(flow_m3_hr, 0.01), 2)

    # 6. Settler / Clarifier
    # Detention time: 4.0 Hours
    settler_detention_hrs = 4.0
    settler_volume_m3 = round(flow_m3_hr * settler_detention_hrs, 2)
    settler_dim_w_m = round(math.sqrt(settler_volume_m3 / 1.5), 2)
    settler_swd_m = 1.5

    # 7. Sludge Holding Tank
    # Anticipated sludge: ~0.7% of treated volume
    sludge_l_day = round(capacity_kld * 1000.0 * 0.007, 0)
    sludge_tank_vol_m3 = round(max((sludge_l_day * 15) / 1000.0, 3.0), 1)  # 15 days holding

    # 8. Mixed Bed Media Filter
    # Pumping flow = 3.5 to 4 x average flow to complete tertiary run in ~4 to 5 hours
    filter_pump_flow_m3_hr = round(max(3.5, flow_m3_hr * 2.5), 1)
    filter_pump_hp = 0.5 if filter_pump_flow_m3_hr <= 4.0 else (1.0 if filter_pump_flow_m3_hr <= 8.0 else 2.0)
    
    # Surface loading rate = 10 m3/m2/hr
    filter_area_req_m2 = filter_pump_flow_m3_hr / 10.0
    filter_dia_m = math.sqrt((4 * filter_area_req_m2) / math.pi)
    filter_dia_mm = round(filter_dia_m * 1000.0)
    # Snap to standard commercial FRP vessel diameters (300, 355, 400, 450, 500, 600 mm)
    vessel_sizes = [250, 300, 355, 400, 450, 500, 600, 750, 900, 1050, 1200]
    chosen_vessel_dia_mm = next((s for s in vessel_sizes if s >= filter_dia_mm), vessel_sizes[-1])
    filter_shell_height_mm = 1370

    # 9. Bag Filter
    bag_filter_micron = 5

    # 10. Footprint & Area Requirements
    # Total civil tank dimensions + machine clearance
    civil_length_ft = 20.0 if capacity_kld <= 25.0 else (28.0 if capacity_kld <= 50.0 else 38.0)
    civil_width_ft = 10.0 if capacity_kld <= 25.0 else (14.0 if capacity_kld <= 50.0 else 18.0)
    total_footprint_sqft = round(civil_length_ft * civil_width_ft, 0)

    # 11. Connected Electrical Load
    total_connected_load_kw = round(
        operating_power_kw + (raw_pump_power_w / 1000.0) + (filter_pump_hp * 0.746) + 0.5, 2
    )

    return {
        "hydraulics": {
            "capacity_kld": capacity_kld,
            "operating_hours": operating_hours,
            "flow_m3_hr": round(flow_m3_hr, 2),
            "flow_lph": round(flow_lph, 0),
            "design_flow_lph": design_flow_lph,
            "design_flow_m3_hr": design_flow_m3_hr,
        },
        "bar_screen": {
            "width_m": bar_screen_width_m,
            "depth_m": bar_screen_depth_m,
            "length_m": bar_screen_length_m,
            "function": "To separate coarse matter and debris from raw sewage",
        },
        "raw_water_tanks": {
            "retention_hours": tank_retention_hrs,
            "required_volume_m3": tank_liquid_vol_m3,
            "tank_dimensions_mm": f"{tank_width_mm}mm x {tank_length_mm}mm x {tank_depth_mm}mm (Depth)",
            "tank_volume_m3": modular_tank_vol_m3,
            "air_required_m3_hr": air_required_m3_hr,
            "o2_required_kg_day": o2_required_kg_day,
            "diffusers_count": diffusers_count,
            "diffuser_type": "Tubular EPDM Membrane Fine Pore (1m length)",
        },
        "raw_pump": {
            "discharge_m3_hr": pump_flow_m3_hr,
            "head_m": 2.0,
            "power_w": raw_pump_power_w,
            "type": "Low head high flow ceramic bearing submersible pump",
        },
        "ec_chamber": {
            "hrt_minutes": ec_hrt_min,
            "active_volume_l": ec_active_volume_l,
            "allowance_l": ec_fixture_allowance_l,
            "total_reactor_volume_l": ec_total_reactor_vol_l,
            "total_reactor_volume_m3": ec_total_reactor_vol_m3,
            "tank_material": "Heavy duty Polypropylene (PP)",
            "dimensions": f"{plate_width_m + 0.05}m(W) x {plate_width_m + 0.05}m(L) x 1.2m(H)",
            "electrode_metal": "Aluminium (Al)" if is_al else "Mild Steel (Fe)",
            "target_dose_mg_l": target_dose_mg_l,
            "operating_current_amps": actual_cell_current_amps,
            "supply_voltage_v": supply_voltage,
            "operating_power_kw": operating_power_kw,
            "specific_energy_kwh_m3": specific_energy_kwh_m3,
            "plate_count": plate_count,
            "plate_dimensions_m": f"{plate_width_m}m(W) x {plate_height_m}m(H) x {int(plate_thickness_m * 1000)}mm(Thick)",
            "inter_electrode_gap_mm": 30,
            "current_density_a_m2": current_density_a_m2,
            "total_pack_weight_kg": total_electrode_pack_weight_kg,
            "daily_dissolution_kg": daily_dissolution_kg,
            "replacement_lifespan_months": months_to_replacement,
        },
        "settler": {
            "detention_hours": settler_detention_hrs,
            "volume_m3": settler_volume_m3,
            "dimensions_m": f"{settler_dim_w_m}m x {settler_dim_w_m}m x {settler_swd_m}m SWD",
            "function": "To separate the electro-coagulated flocs by gravity",
        },
        "sludge_tank": {
            "daily_sludge_l": sludge_l_day,
            "volume_m3": sludge_tank_vol_m3,
            "dimensions_m": "3.35m x 1.22m x 2.30m SWD",
        },
        "media_filter": {
            "pumping_rate_m3_hr": filter_pump_flow_m3_hr,
            "pump_hp": filter_pump_hp,
            "vessel_dia_mm": chosen_vessel_dia_mm,
            "shell_height_mm": filter_shell_height_mm,
            "surface_loading_m3_m2_hr": 10.0,
            "media": "Pebbles, Grit, Silt, Gravel, Coarse Sand, Fine Sand, Activated Carbon",
        },
        "bag_filter": {
            "pore_size_micron": bag_filter_micron,
            "flow_capacity_m3_hr": filter_pump_flow_m3_hr,
        },
        "footprint": {
            "civil_length_ft": civil_length_ft,
            "civil_width_ft": civil_width_ft,
            "total_area_sqft": total_footprint_sqft,
        },
        "electrical": {
            "total_connected_load_kw": total_connected_load_kw,
            "automation": "All-in-one fully automatic PLC controlled machine with motorized actuators",
        },
    }


def get_master_template_seed_data() -> Dict[str, Any]:
    """
    Returns the initial database seed data for the Master Feasibility Template.
    This replaces hardcoded frontend boilerplate with database-driven content.
    """
    return {
        "name": "Master Feasibility Proposal Template (Electrocoagulation)",
        "water_type": "Mixed Domestic Sewage",
        "is_default": True,
        "default_parameters": {
            "capacity_kld": 15.0,
            "operating_hours": 18.0,
            "water_type": "Mixed Domestic Sewage",
            "electrode_metal": "AL",
            "target_dose_mg_l": 25.0,
            "supply_voltage": 48.0,
            "conductivity_us_cm": 2000.0,
            "proposed_model": "HIDREC EZ 1000",
            "project_title": "Waste Water Reclaimer Plant",
            "site_name": "Spraying Systems India Pvt Ltd",
            "site_location": "Peenya Industrial Area, Bengaluru",
            "survey_date": "2023-06-02",
        },
        "page_templates": {
            "page1_cover": {
                "title": "FEASIBILITY REPORT",
                "subtitle": "PROPOSAL FOR WASTE WATER RECLAIMER PLANT",
                "model": "HIDREC EZ 1000",
                "organization_name": "XpredictLabs",
                "confidentiality": "This document contains proprietary design and commercial information intended solely for the recipient.",
            },
            "page2_toc": {
                "sections": [
                    "SITE VISIT REPORT",
                    "OBSERVATION",
                    "PRE-INSTALLATION",
                    "POST INSTALLATION",
                    "PROPOSAL",
                    "PROCESS DIAGRAM",
                    "PROCESS DESCRIPTION",
                    "TECHNICAL SPECIFICATIONS",
                    "SCOPE OF WORK",
                    "COMMERCIALS",
                    "TERMS AND CONDITIONS",
                    "PROJECT SCHEDULE",
                    "APPENDIX - A (CALCULATION SHEET)",
                    "APPENDIX - B (ELECTRICAL DIAGRAM)",
                    "APPENDIX - C (PHOTOS OF SIMILAR PLANT)",
                ]
            },
            "page3_observations": {
                "preamble": "A detailed technical survey of the premises was conducted to assess daily wastewater generation patterns, inlet physical parameters, and space availability for civil and mechanical installations.",
                "points": [
                    "Daily wastewater generation consists of mixed domestic sewage from cafeteria, handwash basins, and sanitary facilities.",
                    "Gravity collection network feeds into the designated collection sump with intermittent peak discharges during morning and lunch hours.",
                    "Existing civil layout allows modular tank positioning with minimal structural interference.",
                    "Available electrical power supply at the proposed plant location meets three-phase requirements.",
                ],
                "raw_characteristics": {
                    "pH": "7.2 - 7.8",
                    "TSS": "250 - 350 mg/L",
                    "BOD5": "200 - 280 mg/L",
                    "COD": "350 - 500 mg/L",
                    "Oil_Grease": "20 - 45 mg/L",
                    "Color": "Turbid Grey",
                },
            },
            "page4_pre_post": {
                "pre_installation": [
                    "High operational dependency on external freshwater supplies and commercial tanker deliveries.",
                    "Recurring sewage disposal charges and environmental regulatory compliance hurdles.",
                    "Foul odour emissions and potential septic conditions in untreated wastewater holding pits.",
                    "Zero on-site water recycling, resulting in substantial discharge of reusable secondary resources.",
                ],
                "post_installation": [
                    "Up to 85% - 90% recovered high-purity water recycled directly for toilet flushing, landscape irrigation, and cooling towers.",
                    "Total elimination of chemical coagulants (Alum/PAC) via clean electrolytic coagulation technology.",
                    "Compact physical footprint with minimal civil works and odourless, silent plant operation.",
                    "Payback period achieved in approximately 14 to 18 months via avoided freshwater procurement.",
                ],
            },
            "page5_proposal_intro": {
                "executive_summary": "XpredictLabs proposes a cutting-edge Electrocoagulation (EC) based Waste Water Reclaimer Plant engineered for high-efficiency non-chemical contaminant removal. Unlike biological STPs that suffer from microbial upsets, EC provides instantaneous, predictable treatment using low-voltage electrolytic dissolution.",
                "key_advantages": [
                    "Continuous automated PLC operation with minimal daily operator intervention.",
                    "Dense, easily dewaterable mineralized flocs producing 60% less sludge volume than conventional chemical treatment.",
                    "Simultaneous pathogen disinfection and heavy metals precipitation through in-situ electrolytic generation of hydroxyl radicals.",
                ],
            },
            "page7_process_description": {
                "stage1_screening": "Coarse and fine debris separation through stainless steel bar screens to protect downstream pump impellers.",
                "stage2_equalization": "Hydraulic flow equalization with fine-bubble aeration to prevent anaerobic septic degradation and maintain uniform solids suspension.",
                "stage3_electrocoagulation": "Primary reactive reactor with sacrificial metallic electrodes where electrolytic oxidation destabilizes colloidal suspended particles, emulsified oils, and organic complexes without added chemicals.",
                "stage4_clarification": "Lamella gravity clarifier for accelerated sedimentation of coagulated flocs into the conical bottom sludge hopper.",
                "stage5_filtration": "Dual media pressure sand filter and activated carbon polisher followed by 5-micron safety bag filtration for sparkling crystal-clear output.",
            },
            "page9_scope_of_work": {
                "xpredict_scope": [
                    "Process engineering, equipment sizing, design calculations, and complete P&ID drawings.",
                    "Manufacturing and supply of skid-mounted Electrocoagulation Reactor Chamber with quick-change electrode pack.",
                    "Supply of high-frequency switched-mode DC power supply unit (SMPS) with polarity-reversal automation.",
                    "Supply of tertiary filtration system including FRP vessels, multi-grade media, and multiport control valves.",
                    "Plant testing, wet commissioning, and hands-on operational training for client facility staff.",
                ],
                "client_scope": [
                    "Civil construction of collection sump, raw water holding tanks, and treated water clear well as per engineering layouts.",
                    "Three-phase 415V, 50Hz electrical power termination with dedicated MCCB/ELCB isolator at plant battery limits.",
                    "Inlet sewage raw water piping up to plant skid and treated water distribution pumping from clear well.",
                    "Protected weather shed or well-ventilated plant room with adequate lighting and drainage floor sump.",
                ],
            },
            "page10_commercials": {
                "equipment_breakdown": [
                    {"item": "HIDREC EC Reactor Chamber & Power Electronics", "qty": "1 Lot", "amount_inr": 485000},
                    {"item": "Equalization Aeration Grid & Raw Lift Pumps", "qty": "1 Set", "amount_inr": 95000},
                    {"item": "Tertiary Dual Media & Carbon Polishing Skid", "qty": "1 Set", "amount_inr": 165000},
                    {"item": "Automation Control Panel (PLC + Touchscreen)", "qty": "1 Unit", "amount_inr": 125000},
                    {"item": "Erection, Skid Piping, Testing & Commissioning", "qty": "1 Job", "amount_inr": 85000},
                ],
                "taxes_note": "GST @ 18% extra as applicable at the time of invoicing.",
                "freight_note": "Freight and transit insurance included up to site battery limits.",
            },
            "page11_terms_conditions": {
                "payment_terms": "40% advance along with confirmed Purchase Order; 50% against proforma invoice prior to dispatch; 10% after successful wet commissioning and handover.",
                "delivery_period": "Skid equipment dispatch within 4 to 6 weeks from receipt of advance and approved layout drawings.",
                "warranty": "12 months comprehensive manufacturer warranty from the date of commissioning covering all mechanical and electrical parts against manufacturing defects.",
                "validity": "Commercial proposal valid for 30 calendar days from the date of issue.",
            },
            "page12_project_schedule": {
                "phases": [
                    {"phase": "Engineering Design & Client Layout Approval", "duration": "Week 1 - 2"},
                    {"phase": "Civil Work by Client & Skid Fabrication", "duration": "Week 2 - 4"},
                    {"phase": "Factory Testing, Quality Inspection & Dispatch", "duration": "Week 4 - 5"},
                    {"phase": "Onsite Skid Placement, Interconnection & Wiring", "duration": "Week 5 - 6"},
                    {"phase": "Wet Commissioning, Lab Testing & Handover", "duration": "Week 6 - 7"},
                ]
            },
            "page13_appendix_a": {
                "design_principles": "Calculations follow Faraday's Law of Electrolysis m = (I * t * M) / (z * F) ensuring stoichiometric coagulant release, optimal current density (12-25 A/m2), and hydraulic retention time of 10-15 minutes.",
            },
            "page14_appendix_b": {
                "electrical_specs": "Supply voltage: 415V AC 3-Phase + Neutral; Reactor input: 0-48V DC variable; Ingress protection: IP55 control enclosure with safety door interlocks, phase failure relays, and overload trips.",
            },
            "page15_appendix_c": {
                "installation_summary": "Modular pre-assembled skid layout engineered for rapid plug-and-play installation, simplified periodic electrode maintenance, and zero downtime during media backwashing.",
            },
        },
    }

