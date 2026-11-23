/**
 * Site Services module types.
 */
import type { Quotation, Followup } from "../../sales/api/types";

// ---- Site & Profile --------------------------------------------------------

export interface SiteServiceProfile {
  id: string;
  dc_number: string;
  service_type: string;
  service_interval_days: number | null;
  last_serviced_date: string | null;
  technician_user_id: string | null;
  technician_display_name: string;
  notes: string;
}

export interface SiteProfileUpdate {
  dc_number?: string;
  service_type?: string;
  service_interval_days?: number | null;
  last_serviced_date?: string | null;
  technician_display_name?: string;
  notes?: string;
}

export interface ConfirmedSite {
  id: string;
  enquiry_id: string;
  /** The machine quote the order was confirmed on. */
  confirmed_quote_id: string | null;
  /** Date of the latest service report for this site, if any. */
  last_service_report_date: string | null;
  customer_name: string;
  site_name: string;
  address: string;
  pincode: string;
  city: string;
  state: string;
  oc_number: string;
  installation_date: string | null;
  service_profile: SiteServiceProfile | null;
  quotes: Quotation[];
  followups?: Followup[];
}

// ---- Schedule --------------------------------------------------------------

export type ScheduleStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "CANCELLED";

export interface ScheduleEntry {
  id: string;
  site_id: string;
  amc_quote_id: string | null;
  service_type: string;
  scheduled_date: string;
  scheduled_time: string | null;
  /** The assigned person (an account), or null when nobody is assigned yet. */
  technician_user_id: string | null;
  /** Their name when they were assigned. */
  technician_display_name: string;
  assigned_at: string | null;
  status: ScheduleStatus;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string;
  notes: string;
  /** The visit's service report, once one is filed. */
  report_id: string | null;
  report_status: ReportStatus | null;
  /** Cancellations and reschedules, oldest first. */
  history: VisitHistoryEntry[];
}

export type VisitHistoryEntry =
  | { event: "cancelled"; at: string; by: string; date: string; reason: string }
  | { event: "rescheduled"; at: string; by: string; from_date: string; to_date: string };

/**
 * Booking or editing a visit. No `status`: a visit moves through Start,
 * Cancel and its service report. No free-text technician: a person's id.
 */
export interface ScheduleCreateUpdate {
  site_id?: string;
  amc_quote_id?: string | null;
  service_type?: string;
  scheduled_date?: string;
  scheduled_time?: string | null;
  technician_user_id?: string | null;
  notes?: string;
}

/** Somebody who can be given work on a site: its own unit's active DMS people. */
export interface UnitPerson {
  user_id: string;
  name: string;
  email: string;
}

// ---- Service Report --------------------------------------------------------

export type ReportStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "AWAITING_CLIENT_SIGN";

export interface ReportAttachment {
  id: string;
  file: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

export interface ServiceReportEntry {
  /** Whose report: the site's dealership, or the organisation. Printed as the heading. */
  company_name: string;
  id: string;
  site_id: string;
  schedule_id: string | null;
  report_code: string;
  service_date: string;
  technician_display_name: string;
  remarks: string;
  service_person_name: string;
  service_person_signature: string;
  client_name: string;
  client_signature: string;
  status: ReportStatus;
  client_approval_status?: "PENDING" | "APPROVED" | "REJECTED";
  approval_remarks?: string;
  approved_at?: string | null;
  sign_link_token: string;
  attachments: ReportAttachment[];
}

// ---- Water Report ----------------------------------------------------------

export interface WaterReportEntry {
  /** Whose report: the site's dealership, or the organisation. Printed as the heading. */
  company_name: string;
  id: string;
  site_id: string;
  date_tested: string;
  ph: number | null;
  tds: number | null;
  hardness: number | null;
  iron: number | null;
  technician_display_name: string;
  remarks: string;
  attachment: string;
}

// ---- Complaint -------------------------------------------------------------

export type ComplaintPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ComplaintStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface ComplaintEntry {
  /** Whose report: the site's dealership, or the organisation. Printed as the heading. */
  company_name: string;
  id: string;
  site_id: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assigned_service_person_name: string;
  /** The assigned person (an account), or null when nobody is assigned. */
  assigned_service_person_user_id: string | null;
  assigned_at: string | null;
  attachment: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  /** What was done, written when it was resolved. */
  resolution_notes: string;
  created_at: string;
  complainant_user_id: string | null;
}

/** What deleting a visit would affect (GET .../schedules/<id>/dependencies/). */
export interface ScheduleDependencies {
  /** Kept on delete, just no longer linked to the visit. */
  service_reports: number;
}
