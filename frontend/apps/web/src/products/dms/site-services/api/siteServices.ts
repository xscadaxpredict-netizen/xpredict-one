import { request } from "../../shared/api/request";
import type {
  ConfirmedSite,
  SiteProfileUpdate,
  ScheduleEntry,
  ScheduleCreateUpdate,
  ServiceReportEntry,
  WaterReportEntry,
  ComplaintEntry,
  ScheduleDependencies,
  UnitPerson,
} from "./types";

export async function listSites(orgSlug: string): Promise<ConfirmedSite[]> {
  return request<ConfirmedSite[]>(`/api/v1/orgs/${orgSlug}/dms/site-services/sites/`);
}

export async function updateSiteProfile(
  orgSlug: string,
  siteId: string,
  payload: SiteProfileUpdate,
): Promise<ConfirmedSite> {
  return request<ConfirmedSite>(`/api/v1/orgs/${orgSlug}/dms/site-services/sites/${siteId}/profile/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listSchedules(orgSlug: string, siteId?: string): Promise<ScheduleEntry[]> {
  const qs = siteId ? `?site_id=${siteId}` : "";
  return request<ScheduleEntry[]>(`/api/v1/orgs/${orgSlug}/dms/site-services/schedules/${qs}`);
}

export async function createSchedule(orgSlug: string, payload: ScheduleCreateUpdate): Promise<ScheduleEntry> {
  return request<ScheduleEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/schedules/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSchedule(
  orgSlug: string,
  scheduleId: string,
  payload: ScheduleCreateUpdate,
): Promise<ScheduleEntry> {
  return request<ScheduleEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/schedules/${scheduleId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** `confirm`: the user has seen `getScheduleDependencies`; required when there are any. */
export async function deleteSchedule(orgSlug: string, scheduleId: string, confirm = false): Promise<void> {
  const query = confirm ? "?confirm=true" : "";
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/site-services/schedules/${scheduleId}/${query}`, {
    method: "DELETE",
  });
}

export async function getScheduleDependencies(
  orgSlug: string,
  scheduleId: string,
): Promise<ScheduleDependencies> {
  return request<ScheduleDependencies>(
    `/api/v1/orgs/${orgSlug}/dms/site-services/schedules/${scheduleId}/dependencies/`,
  );
}

export async function listSitePeople(orgSlug: string, siteId: string): Promise<UnitPerson[]> {
  return request<UnitPerson[]>(`/api/v1/orgs/${orgSlug}/dms/site-services/sites/${siteId}/people/`);
}

export async function rescheduleVisit(
  orgSlug: string,
  scheduleId: string,
  payload: { scheduled_date: string; technician_user_id?: string | null },
): Promise<ScheduleEntry> {
  return request<ScheduleEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/schedules/${scheduleId}/reschedule/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelVisit(orgSlug: string, scheduleId: string, reason: string): Promise<ScheduleEntry> {
  return request<ScheduleEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/schedules/${scheduleId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function listServiceReports(orgSlug: string, siteId?: string): Promise<ServiceReportEntry[]> {
  const qs = siteId ? `?site_id=${siteId}` : "";
  return request<ServiceReportEntry[]>(`/api/v1/orgs/${orgSlug}/dms/site-services/service-reports/${qs}`);
}

export async function createServiceReport(orgSlug: string, payload: FormData): Promise<ServiceReportEntry> {
  return request<ServiceReportEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/service-reports/`, {
    method: "POST",
    body: payload,
  });
}

export async function updateServiceReport(
  orgSlug: string,
  reportId: string,
  payload: FormData | Record<string, any>
): Promise<ServiceReportEntry> {
  const isFormData = payload instanceof FormData;
  return request<ServiceReportEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/service-reports/${reportId}/`, {
    method: "PATCH",
    body: isFormData ? payload : JSON.stringify(payload),
  });
}

export async function deleteServiceReport(orgSlug: string, reportId: string): Promise<void> {
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/site-services/service-reports/${reportId}/`, {
    method: "DELETE",
  });
}

export async function listWaterReports(orgSlug: string, siteId?: string): Promise<WaterReportEntry[]> {
  const qs = siteId ? `?site_id=${siteId}` : "";
  return request<WaterReportEntry[]>(`/api/v1/orgs/${orgSlug}/dms/site-services/water-reports/${qs}`);
}

export async function createWaterReport(orgSlug: string, payload: FormData): Promise<WaterReportEntry> {
  return request<WaterReportEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/water-reports/`, {
    method: "POST",
    body: payload,
  });
}

export async function updateWaterReport(orgSlug: string, reportId: string, payload: FormData): Promise<WaterReportEntry> {
  return request<WaterReportEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/water-reports/${reportId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteWaterReport(orgSlug: string, reportId: string): Promise<void> {
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/site-services/water-reports/${reportId}/`, {
    method: "DELETE",
  });
}

export async function listComplaints(orgSlug: string, siteId?: string): Promise<ComplaintEntry[]> {
  const qs = siteId ? `?site_id=${siteId}` : "";
  return request<ComplaintEntry[]>(`/api/v1/orgs/${orgSlug}/dms/site-services/complaints/${qs}`);
}

export async function createComplaint(orgSlug: string, payload: FormData): Promise<ComplaintEntry> {
  return request<ComplaintEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/complaints/`, {
    method: "POST",
    body: payload,
  });
}

export async function updateComplaint(
  orgSlug: string,
  complaintId: string,
  payload: FormData | Record<string, any>
): Promise<ComplaintEntry> {
  const isFormData = payload instanceof FormData;
  return request<ComplaintEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/complaints/${complaintId}/`, {
    method: "PATCH",
    body: isFormData ? payload : JSON.stringify(payload),
  });
}

/** Start work, resolve (notes required), close, or reopen. */
export async function setComplaintStatus(
  orgSlug: string,
  complaintId: string,
  status: "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "OPEN",
  notes = "",
): Promise<ComplaintEntry> {
  return request<ComplaintEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/complaints/${complaintId}/status/`, {
    method: "POST",
    body: JSON.stringify({ status, notes }),
  });
}

export async function deleteComplaint(orgSlug: string, complaintId: string): Promise<void> {
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/site-services/complaints/${complaintId}/`, {
    method: "DELETE",
  });
}
