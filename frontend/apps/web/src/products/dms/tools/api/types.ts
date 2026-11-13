/**
 * Tools module types.
 *
 * Types for marketing materials, capacity calculator, and feasibility.
 */

// ---- Marketing Kit ---------------------------------------------------------

export type MaterialType = "brochure" | "video" | "ad";

export interface Brochure {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: string;
  description: string;
}

export interface Video {
  id: string;
  title: string;
  duration: string;
  resolution: string;
  fileName: string;
  description: string;
}

export interface AdBanner {
  id: string;
  title: string;
  format: string;
  fileName: string;
  fileSize: string;
  description: string;
}

// ---- Capacity Calculator ---------------------------------------------------

export interface CapacityInput {
  application: string;
  flowRate: number;
  tds: number;
  temperature: number;
}

export interface CapacityResult {
  membraneCount: number;
  vesselCount: number;
  pumpPower: string;
  recoveryRate: string;
  systemType: string;
}

// ---- Feasibility Study & EC System -----------------------------------------

export type AttachmentCategory =
  | "OVERALL_PROCESS_FLOW"
  | "PROCESS_DIAGRAM"
  | "ELECTRICAL_DIAGRAM"
  | "WATER_BEFORE_AFTER"
  | "INSTALLATION_PHOTO"
  | "NABL_REPORT"
  | "OTHER";

export interface FeasibilityAttachment {
  id: string;
  report: string;
  category: AttachmentCategory;
  title: string;
  file: string;
  file_name: string;
  file_size: string;
  caption?: string;
  created_at: string;
}

export interface CalculatedSpecs {
  hydraulics: {
    capacity_kld: number;
    operating_hours: number;
    flow_m3_hr: number;
    flow_lph: number;
    design_flow_lph: number;
    design_flow_m3_hr: number;
  };
  bar_screen: {
    width_m: number;
    depth_m: number;
    length_m: number;
    function: string;
  };
  raw_water_tanks: {
    retention_hours: number;
    required_volume_m3: number;
    tank_dimensions_mm: string;
    tank_volume_m3: number;
    air_required_m3_hr: number;
    o2_required_kg_day: number;
    diffusers_count: number;
    diffuser_type: string;
  };
  raw_pump: {
    discharge_m3_hr: number;
    head_m: number;
    power_w: number;
    type: string;
  };
  ec_chamber: {
    hrt_minutes: number;
    active_volume_l: number;
    allowance_l: number;
    total_reactor_volume_l: number;
    total_reactor_volume_m3: number;
    tank_material: string;
    dimensions: string;
    electrode_metal: string;
    target_dose_mg_l: number;
    operating_current_amps: number;
    supply_voltage_v: number;
    operating_power_kw: number;
    specific_energy_kwh_m3: number;
    plate_count: number;
    plate_dimensions_m: string;
    inter_electrode_gap_mm: number;
    current_density_a_m2: number;
    total_pack_weight_kg: number;
    daily_dissolution_kg: number;
    replacement_lifespan_months: number;
  };
  settler: {
    detention_hours: number;
    volume_m3: number;
    dimensions_m: string;
    function: string;
  };
  sludge_tank: {
    daily_sludge_l: number;
    volume_m3: number;
    dimensions_m: string;
  };
  media_filter: {
    pumping_rate_m3_hr: number;
    pump_hp: number;
    vessel_dia_mm: number;
    shell_height_mm: number;
    surface_loading_m3_m2_hr: number;
    media: string;
  };
  bag_filter: {
    pore_size_micron: number;
    flow_capacity_m3_hr: number;
  };
  footprint: {
    civil_length_ft: number;
    civil_width_ft: number;
    total_area_sqft: number;
  };
  electrical: {
    total_connected_load_kw: number;
    automation: string;
  };
}

export interface FeasibilityTemplate {
  id: string;
  name: string;
  water_type: string;
  is_default: boolean;
  page_templates: Record<string, any>;
  default_parameters: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface FeasibilityLineItem {
  id?: string;
  item_name: string;
  specification?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price?: number;
  display_order?: number;
}

export interface FeasibilityReport {
  id: string;
  proposal_number?: string;
  template?: string | null;
  site?: string | null;
  unit_id?: string | null;
  site_name: string;
  site_location: string;
  project_title: string;
  proposed_model: string;
  model_name?: string;
  survey_date?: string | null;
  capacity_kld: number;
  operating_hours: number;
  water_type: string;
  electrode_metal: "AL" | "FE";
  target_dose_mg_l: number;
  supply_voltage: number;
  conductivity_us_cm: number;
  abstract: string;
  observations: string[];
  design_parameters: Record<string, any>;
  calculated_specs?: CalculatedSpecs;
  xpredict_scope?: string[];
  client_scope?: string[];
  terms_conditions?: string[];
  water_specs?: Record<string, any>;
  items?: FeasibilityLineItem[];
  status: "DRAFT" | "FINAL" | "ARCHIVED";
  attachments: FeasibilityAttachment[];
  created_at: string;
  updated_at: string;
}

// ---- Electrocoagulation (EC) Dosing Types ---------------------------------
import type { EcConstants } from "./ecDosingMath";

export interface CalculatorSettingsData {
  constants: Record<string, number>;
  ec_constants?: EcConstants;
}

export interface ECDosingCalculation {
  id: string;
  unit_id: string | null;
  site: string | null;
  site_name?: string | null;
  title: string;
  calculation_mode: "TIME_FROM_DOSE" | "DOSE_FROM_TIME" | "CURRENT_FROM_DOSE";
  machine_model: string;
  metal_type: string;
  water_type: string;
  input_params: Record<string, any>;
  output_params: Record<string, any>;
  notes: string;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateECDosingCalculationPayload {
  site?: string | null;
  site_name?: string | null;
  title: string;
  calculation_mode: "TIME_FROM_DOSE" | "DOSE_FROM_TIME" | "CURRENT_FROM_DOSE";
  machine_model: string;
  metal_type: string;
  water_type?: string;
  input_params: Record<string, any>;
  output_params: Record<string, any>;
  notes?: string;
}


