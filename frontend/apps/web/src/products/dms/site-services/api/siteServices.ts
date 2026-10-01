/**
 * Site Services API layer.
 *
 * Placeholder — currently all site services data comes from the
 * shared enquiries endpoint (sales). These stubs are ready for
 * when site-services gets its own dedicated backend endpoints.
 */

import type {
  ServiceReportEntry,
  WaterReportEntry,
  ScheduleEntry,
  ComplaintEntry,
  AMCContract,
} from "./types";

// ---- API stubs -------------------------------------------------------------

export function fetchServiceReports(_siteId: string): Promise<ServiceReportEntry[]> {
  return Promise.resolve([]);
}

export function fetchWaterReports(_siteId: string): Promise<WaterReportEntry[]> {
  return Promise.resolve([]);
}

export function fetchSchedules(_siteId: string): Promise<ScheduleEntry[]> {
  return Promise.resolve([]);
}

export function fetchComplaints(_siteId: string): Promise<ComplaintEntry[]> {
  return Promise.resolve([]);
}

export function fetchAMCContracts(_siteId: string): Promise<AMCContract[]> {
  return Promise.resolve([]);
}
