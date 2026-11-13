/**
 * Electrocoagulation (EC) Dosing and Hydraulic Retention Time (HRT) Engineering Engine.
 *
 * Implements Faraday's Electrochemical Law and Resistance-Voltage Scaling based on
 * real R&D bench sweep calibrations (Aluminium Al3+ and Mild Steel Fe2+).
 */

export const FARADAY_CONSTANT = 96485; // C / mol

export interface MetalConfig {
  key: string;
  name: string;
  molar_mass: number; // g / mol (Al=27.0, Fe=56.0)
  valence_n: number;  // Al=3, Fe=2
}

export interface MachineConfig {
  key: string;
  name: string;
  capacity_kld: number;
  length_mm: number;
  width_mm: number;
  depth_mm: number;
  volume_m3: number;
  plate_count: number;
  plate_length_mm: number;
  plate_height_mm: number;
  plate_thickness_mm?: number;
  plate_spacing_mm: number;
  supply_voltage_max: number;
  default_current_amps: number;
}

export interface WaterTypeConfig {
  id: string;
  name: string;
  default_dose: number; // mg/L
  settling_time_min: number; // minutes
}

export interface EcConstants {
  machines: Record<string, MachineConfig>;
  metals: Record<string, MetalConfig>;
  water_types: WaterTypeConfig[];
  custom_parameters?: Record<string, number>;
}

export const FALLBACK_METAL: MetalConfig = {
  key: "AL",
  name: "Aluminium (Al)",
  molar_mass: 27.0,
  valence_n: 3,
};

export const DEFAULT_METALS: Record<string, MetalConfig> = {
  AL: FALLBACK_METAL,
  MS: { key: "MS", name: "Mild Steel / Iron (Fe)", molar_mass: 56.0, valence_n: 2 },
};

export const DEFAULT_WATER_TYPES: WaterTypeConfig[] = [
  { id: "algal", name: "Micro algal green water", default_dose: 35.0, settling_time_min: 6 },
  { id: "laundry", name: "Laundry Waste Water", default_dose: 25.0, settling_time_min: 5 },
  { id: "grey", name: "Domestic Grey water", default_dose: 20.0, settling_time_min: 5 },
  { id: "mixed_sewage", name: "Mixed Sewage water", default_dose: 30.0, settling_time_min: 6 },
  { id: "black", name: "Domestic Black Water", default_dose: 40.0, settling_time_min: 7 },
  { id: "industrial_sewage", name: "Mixed Industrial Sewage", default_dose: 35.0, settling_time_min: 7 },
  { id: "hospital", name: "Hospital Waste water", default_dose: 35.0, settling_time_min: 6 },
  { id: "lake", name: "Lake water", default_dose: 15.0, settling_time_min: 5 },
  { id: "textile", name: "Textile Dyeing water", default_dose: 45.0, settling_time_min: 7 },
  { id: "starch", name: "Starch rich waste water", default_dose: 40.0, settling_time_min: 7 },
  { id: "effluent", name: "Mixed Industrial Effluent water", default_dose: 45.0, settling_time_min: 7 },
];

export const DEFAULT_MACHINES: Record<string, MachineConfig> = {
  "6kld": {
    key: "6kld",
    name: "HIDREC 6 KLD",
    capacity_kld: 6.0,
    length_mm: 1000,
    width_mm: 500,
    depth_mm: 800,
    volume_m3: 0.400,
    plate_count: 4,
    plate_length_mm: 500,
    plate_height_mm: 300,
    plate_thickness_mm: 6,
    plate_spacing_mm: 20,
    supply_voltage_max: 40.0,
    default_current_amps: 15.0,
  },
  "25kld": {
    key: "25kld",
    name: "HIDREC 25 KLD",
    capacity_kld: 25.0,
    length_mm: 1600,
    width_mm: 800,
    depth_mm: 1000,
    volume_m3: 1.280,
    plate_count: 6,
    plate_length_mm: 800,
    plate_height_mm: 400,
    plate_thickness_mm: 6,
    plate_spacing_mm: 25,
    supply_voltage_max: 48.0,
    default_current_amps: 40.0,
  },
  "50kld": {
    key: "50kld",
    name: "HIDREC 50 KLD",
    capacity_kld: 50.0,
    length_mm: 2000,
    width_mm: 1000,
    depth_mm: 1200,
    volume_m3: 2.400,
    plate_count: 8,
    plate_length_mm: 1000,
    plate_height_mm: 400,
    plate_thickness_mm: 8,
    plate_spacing_mm: 30,
    supply_voltage_max: 48.0,
    default_current_amps: 80.0,
  },
};

/**
 * Calculates tank liquid volume in m3 from dimensions in millimeters.
 */
export function calculateTankVolume(lengthMm: number, widthMm: number, depthMm: number): number {
  if (!lengthMm || !widthMm || !depthMm) return 0;
  return Number(((lengthMm * widthMm * depthMm) / 1_000_000_000).toFixed(4));
}

/**
 * Formats decimal minutes into "X min Y sec" readable string.
 */
export function formatMinutesReadable(minutes: number): string {
  if (isNaN(minutes) || minutes <= 0) return "0 min 0 sec";
  const totalSeconds = Math.round(minutes * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins} min ${secs} sec`;
}

/**
 * Direction 1: Given Contact Time / HRT (minutes), calculates Delivered Dose (mg/L).
 * Dose (mg/L) = (I * M * t_sec) / (n * F * V_m3)
 */
export function calculateDoseFromHrt({
  currentAmps,
  molarMass,
  valenceN,
  volumeM3,
  timeMinutes,
  faraday = FARADAY_CONSTANT,
}: {
  currentAmps: number;
  molarMass: number;
  valenceN: number;
  volumeM3: number;
  timeMinutes: number;
  faraday?: number;
}): number {
  if (!valenceN || !volumeM3 || volumeM3 <= 0 || !faraday) return 0;
  const timeSeconds = timeMinutes * 60;
  const dose = (currentAmps * molarMass * timeSeconds) / (valenceN * faraday * volumeM3);
  return Number(dose.toFixed(2));
}

/**
 * Direction 2: Given Target Dose (mg/L), calculates Required Contact Time / HRT (minutes).
 * t_sec = (Dose * n * F * V_m3) / (I * M)
 */
export function calculateHrtFromDose({
  targetDoseMgL,
  molarMass,
  valenceN,
  volumeM3,
  currentAmps,
  faraday = FARADAY_CONSTANT,
}: {
  targetDoseMgL: number;
  molarMass: number;
  valenceN: number;
  volumeM3: number;
  currentAmps: number;
  faraday?: number;
}): { timeMinutes: number; timeSeconds: number; formatted: string } {
  if (!currentAmps || currentAmps <= 0 || !molarMass) {
    return { timeMinutes: 0, timeSeconds: 0, formatted: "0 min 0 sec" };
  }
  const timeSeconds = (targetDoseMgL * valenceN * faraday * volumeM3) / (currentAmps * molarMass);
  const timeMinutes = timeSeconds / 60;
  return {
    timeMinutes: Number(timeMinutes.toFixed(4)),
    timeSeconds: Number(timeSeconds.toFixed(1)),
    formatted: formatMinutesReadable(timeMinutes),
  };
}

/**
 * Direction 3: Given Target Dose & Chosen Time (minutes), calculates Required Current (Amps).
 * I = (Dose * n * F * V_m3) / (M * t_sec)
 */
export function calculateCurrentFromDoseAndHrt({
  targetDoseMgL,
  molarMass,
  valenceN,
  volumeM3,
  timeMinutes,
  faraday = FARADAY_CONSTANT,
}: {
  targetDoseMgL: number;
  molarMass: number;
  valenceN: number;
  volumeM3: number;
  timeMinutes: number;
  faraday?: number;
}): number {
  const timeSeconds = timeMinutes * 60;
  if (!molarMass || !timeSeconds || timeSeconds <= 0) return 0;
  const current = (targetDoseMgL * valenceN * faraday * volumeM3) / (molarMass * timeSeconds);
  return Number(current.toFixed(2));
}

/**
 * Equipment & Power Supply Feasibility Check:
 * Estimates the terminal cell voltage V_terminal = V0 + I * R_scaled
 * and compares it with the power supply's available voltage limit.
 */
export function checkVoltageFeasibility({
  currentAmps,
  plateCount,
  plateLengthMm,
  plateHeightMm,
  plateSpacingMm,
  metalKey = "AL",
  supplyVoltageMax = 48.0,
}: {
  currentAmps: number;
  plateCount: number;
  plateLengthMm: number;
  plateHeightMm: number;
  plateSpacingMm: number;
  metalKey?: string;
  supplyVoltageMax?: number;
}): {
  scaledResistanceOhms: number;
  voltageRequiredVolts: number;
  isFeasible: boolean;
  status: "FEASIBLE" | "MARGINAL" | "EXCEEDS_LIMIT";
  message: string;
} {
  // Baseline bench references from tested R&D data:
  const isAl = metalKey.toUpperCase() === "AL";
  const rBench = isAl ? 12.19 : 18.04; // ohms
  const v0Bench = isAl ? 5.32 : 1.00;  // V
  const benchAreaM2 = 0.0248;           // m2
  const benchSpacingMm = 10.0;          // mm

  // Scaled plate geometry
  const singlePlateFaceM2 = 2 * (plateLengthMm / 1000) * (plateHeightMm / 1000);
  const totalPlateAreaM2 = Math.max(0.01, (plateCount || 2) * singlePlateFaceM2);
  const areaRatio = totalPlateAreaM2 / benchAreaM2;
  const spacingRatio = Math.max(0.5, (plateSpacingMm || 20) / benchSpacingMm);

  // Scaled Resistance: R_scaled = R_bench * (spacingRatio / areaRatio)
  const scaledResistanceOhms = Number((rBench * (spacingRatio / areaRatio)).toFixed(4));
  const voltageRequiredVolts = Number((v0Bench + currentAmps * scaledResistanceOhms).toFixed(1));

  let status: "FEASIBLE" | "MARGINAL" | "EXCEEDS_LIMIT" = "FEASIBLE";
  let message = `Normal: Required ${voltageRequiredVolts}V is within supply limit (${supplyVoltageMax}V).`;

  if (voltageRequiredVolts > supplyVoltageMax) {
    status = "EXCEEDS_LIMIT";
    message = `Warning: Required ${voltageRequiredVolts}V exceeds maximum power supply limit (${supplyVoltageMax}V). Increase residence time or reduce applied current.`;
  } else if (voltageRequiredVolts > supplyVoltageMax * 0.88) {
    status = "MARGINAL";
    message = `Marginal: Required ${voltageRequiredVolts}V operates near upper ceiling (${supplyVoltageMax}V).`;
  }

  return {
    scaledResistanceOhms,
    voltageRequiredVolts,
    isFeasible: status !== "EXCEEDS_LIMIT",
    status,
    message,
  };
}
