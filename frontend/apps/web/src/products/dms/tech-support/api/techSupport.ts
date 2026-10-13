import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../shared/api/request";
import type { UserManual, MachineVideo, RequestCall } from "./types";

export function useTechSupport(orgSlug: string) {
  const queryClient = useQueryClient();
  const basePath = `/api/v1/orgs/${orgSlug}/dms/tech-support`;

  const manualsQuery = useQuery({
    queryKey: ["manuals", orgSlug],
    queryFn: () => request<UserManual[]>(`${basePath}/manuals/`),
  });

  const uploadManualMutation = useMutation({
    mutationFn: (formData: FormData) => request<UserManual>(`${basePath}/manuals/`, {
      method: "POST",
      body: formData,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manuals", orgSlug] }),
  });

  const deleteManualMutation = useMutation({
    mutationFn: (id: string) => request(`${basePath}/manuals/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manuals", orgSlug] }),
  });

  const videosQuery = useQuery({
    queryKey: ["videos", orgSlug],
    queryFn: () => request<MachineVideo[]>(`${basePath}/videos/`),
  });

  const uploadVideoMutation = useMutation({
    mutationFn: (formData: FormData) => request<MachineVideo>(`${basePath}/videos/`, {
      method: "POST",
      body: formData,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["videos", orgSlug] }),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: (id: string) => request(`${basePath}/videos/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["videos", orgSlug] }),
  });

  const callsQuery = useQuery({
    queryKey: ["calls", orgSlug],
    queryFn: () => request<RequestCall[]>(`${basePath}/calls/`),
  });

  const createCallMutation = useMutation({
    mutationFn: (callData: (Partial<RequestCall> & { attachment?: File | null }) | FormData) => {
      const isFormData = callData instanceof FormData;
      return request<RequestCall>(`${basePath}/calls/`, {
        method: "POST",
        body: isFormData ? callData : JSON.stringify(callData),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calls", orgSlug] }),
  });

  const updateCallMutation = useMutation({
    mutationFn: ({ id, ...updates }: Partial<RequestCall> & { id: string }) => request<RequestCall>(`${basePath}/calls/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calls", orgSlug] }),
  });

  const deleteCallMutation = useMutation({
    mutationFn: (id: string) => request(`${basePath}/calls/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calls", orgSlug] }),
  });

  return {
    manuals: manualsQuery.data ?? [],
    manualsPending: manualsQuery.isPending,
    uploadManual: uploadManualMutation.mutate,
    deleteManual: deleteManualMutation.mutate,

    videos: videosQuery.data ?? [],
    videosPending: videosQuery.isPending,
    uploadVideo: uploadVideoMutation.mutate,
    deleteVideo: deleteVideoMutation.mutate,

    calls: callsQuery.data ?? [],
    callsPending: callsQuery.isPending,
    createCall: createCallMutation.mutate,
    updateCall: updateCallMutation.mutate,
    deleteCall: deleteCallMutation.mutate,
  };
}
