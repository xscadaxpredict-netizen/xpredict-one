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
