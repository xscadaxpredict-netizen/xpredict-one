import { useQueryClient } from "@tanstack/react-query";
import { useOrgQuery, useOrgMutation } from "@xpredict/api-client";
import * as api from "../api/siteServices";
import type {
  ConfirmedSite,
  SiteProfileUpdate,
  ScheduleEntry,
  ScheduleCreateUpdate,
  ServiceReportEntry,
  WaterReportEntry,
  ComplaintEntry,
} from "../api/types";

export function useSites() {
  return useOrgQuery({
    key: ["site-services", "sites"],
    queryFn: (orgSlug) => api.listSites(orgSlug),
  });
}

export function useUpdateSiteProfile() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, { siteId, payload }: { siteId: string; payload: SiteProfileUpdate }) =>
      api.updateSiteProfile(orgSlug, siteId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}

export function useSchedules(siteId?: string) {
  return useOrgQuery({
    key: ["site-services", "schedules", siteId || "all"],
    queryFn: (orgSlug) => api.listSchedules(orgSlug, siteId),
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, payload: ScheduleCreateUpdate) =>
      api.createSchedule(orgSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, { scheduleId, payload }: { scheduleId: string; payload: ScheduleCreateUpdate }) =>
      api.updateSchedule(orgSlug, scheduleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}

export function useServiceReports(siteId?: string) {
  return useOrgQuery({
    key: ["site-services", "service-reports", siteId || "all"],
    queryFn: (orgSlug) => api.listServiceReports(orgSlug, siteId),
  });
}

export function useCreateServiceReport() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, formData: FormData) =>
      api.createServiceReport(orgSlug, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}

export function useWaterReports(siteId?: string) {
  return useOrgQuery({
    key: ["site-services", "water-reports", siteId || "all"],
    queryFn: (orgSlug) => api.listWaterReports(orgSlug, siteId),
  });
}

export function useCreateWaterReport() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, formData: FormData) =>
      api.createWaterReport(orgSlug, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}

export function useComplaints(siteId?: string) {
  return useOrgQuery({
    key: ["site-services", "complaints", siteId || "all"],
    queryFn: (orgSlug) => api.listComplaints(orgSlug, siteId),
  });
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, formData: FormData) =>
      api.createComplaint(orgSlug, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}

export function useUpdateComplaintStatus() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, { complaintId, status }: { complaintId: string; status: string }) =>
      api.updateComplaintStatus(orgSlug, complaintId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
    },
  });
}
