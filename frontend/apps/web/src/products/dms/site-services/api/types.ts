/**
 * Site Services module types.
 *
 * Types for service reports, water reports, scheduling,
 * complaints, and AMC contracts.
 */

// ---- Service Reports -------------------------------------------------------

export type ReportStatus = "COMPLETED" | "PENDING" | "IN_PROGRESS";

export interface ServiceReportEntry {
  id: string;
  report_code: string;
  date: string;
  technician: string;
  zone: string;
  remarks: string;
  status: ReportStatus;
}

// ---- Water Reports ---------------------------------------------------------

export interface WaterReportEntry {
  id: string;
  date: string;
  ph: number;
  tds: number;
  hardness: number;
  iron: number;
  technician: string;
  remarks: string;
}

// ---- Scheduling ------------------------------------------------------------

export type ScheduleStatus = "SCHEDULED" | "COMPLETED" | "MISSED" | "CANCELLED";

export interface ScheduleEntry {
  id: string;
  date: string;
  time: string;
  type: string;
  technician: string;
  status: ScheduleStatus;
  notes: string;
}

// ---- Complaints ------------------------------------------------------------

export type ComplaintPriority = "Low" | "Medium" | "High" | "Critical";
export type ComplaintStatus = "OPEN" | "RESOLVED";

export interface ComplaintEntry {
  id: string;
  date: string;
  issue: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  servicePersonName: string;
  siteId?: string;
}

// ---- AMC -------------------------------------------------------------------

export type AMCStatus = "ACTIVE" | "EXPIRED" | "PENDING_RENEWAL";

export interface AMCContract {
  id: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  status: AMCStatus;
  type: string;
  visitFrequency: string;
  amount: number;
}
