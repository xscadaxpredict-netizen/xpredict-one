/**
 * Site Services module types.
 */
import type { Quotation } from "../../sales/api/types";

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
  technician_display_name: string;
  status: ScheduleStatus;
  notes: string;
}

export interface ScheduleCreateUpdate {
  site_id?: string;
  amc_quote_id?: string | null;
  service_type?: string;
  scheduled_date?: string;
  scheduled_time?: string | null;
  technician_display_name?: string;
  status?: ScheduleStatus;
  notes?: string;
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
  id: string;
  site_id: string;
  schedule_id: string | null;
  report_code: string;
  service_date: string;
  zone: string;
  technician_display_name: string;
  remarks: string;
  service_person_name: string;
  service_person_signature: string;
  client_name: string;
  client_signature: string;
  status: ReportStatus;
  attachments: ReportAttachment[];
}

// ---- Water Report ----------------------------------------------------------

export interface WaterReportEntry {
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
  id: string;
  site_id: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assigned_service_person_name: string;
  attachment: string;
  resolved_at: string | null;
  created_at: string;
  complainant_user_id: string | null;
}
