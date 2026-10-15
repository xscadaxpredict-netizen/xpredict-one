import { useQueryClient } from "@tanstack/react-query";
import { useOrgQuery, useOrgMutation } from "@xpredict/api-client";
import * as api from "../api/siteServices";
import type {
  SiteProfileUpdate,
  ScheduleCreateUpdate,
} from "../api/types";

function invalidateSiteServicesQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey.some((k) => typeof k === "string" && k.includes("site-services")),
  });
}

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
      invalidateSiteServicesQueries(queryClient);
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
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, { scheduleId, payload }: { scheduleId: string; payload: ScheduleCreateUpdate }) =>
      api.updateSchedule(orgSlug, scheduleId, payload),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, scheduleId: string) =>
      api.deleteSchedule(orgSlug, scheduleId),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
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
    mutationFn: (orgSlug: string, formData: FormData | Record<string, any>) =>
      api.createServiceReport(orgSlug, formData as any),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useUpdateServiceReport() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (
      orgSlug: string,
      { reportId, payload }: { reportId: string; payload: FormData | Record<string, any> }
    ) => api.updateServiceReport(orgSlug, reportId, payload),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useDeleteServiceReport() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, reportId: string) =>
      api.deleteServiceReport(orgSlug, reportId),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
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
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useUpdateWaterReport() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, { reportId, formData }: { reportId: string; formData: FormData }) =>
      api.updateWaterReport(orgSlug, reportId, formData),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useDeleteWaterReport() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, reportId: string) =>
      api.deleteWaterReport(orgSlug, reportId),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
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
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useUpdateComplaint() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (
      orgSlug: string,
      { complaintId, payload }: { complaintId: string; payload: FormData | Record<string, any> }
    ) => api.updateComplaint(orgSlug, complaintId, payload),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
    },
  });
}

export function useDeleteComplaint() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, complaintId: string) =>
      api.deleteComplaint(orgSlug, complaintId),
    onSuccess: () => {
      invalidateSiteServicesQueries(queryClient);
    },
  });
}
