import { request } from "../../shared/api/request";
import type {
  ConfirmedSite,
  SiteProfileUpdate,
  ScheduleEntry,
  ScheduleCreateUpdate,
  ServiceReportEntry,
  WaterReportEntry,
  ComplaintEntry,
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

export async function updateComplaint(orgSlug: string, complaintId: string, payload: FormData): Promise<ComplaintEntry> {
  return request<ComplaintEntry>(`/api/v1/orgs/${orgSlug}/dms/site-services/complaints/${complaintId}/`, {
    method: "PATCH",
    body: payload,
  });
}
