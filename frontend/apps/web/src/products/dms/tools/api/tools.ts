import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../shared/api/request";
import type { Brochure, Video, AdBanner, CapacityInput, CapacityResult } from "./types";

export function useTools(orgSlug: string) {
  const queryClient = useQueryClient();
  const basePath = `/api/v1/orgs/${orgSlug}/dms/tools`;

  const marketingQuery = useQuery({
    queryKey: ["marketing", orgSlug],
    queryFn: () => request<any[]>(`${basePath}/marketing/`),
  });

  const uploadMarketingMutation = useMutation({
    mutationFn: (formData: FormData) => request(`${basePath}/marketing/`, {
      method: "POST",
      body: formData,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketing", orgSlug] }),
  });

  const deleteMarketingMutation = useMutation({
    mutationFn: (id: string) => request(`${basePath}/marketing/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketing", orgSlug] }),
  });

  const calcsQuery = useQuery({
    queryKey: ["calculations", orgSlug],
    queryFn: () => request<any[]>(`${basePath}/calculations/`),
  });

  const createCalcMutation = useMutation({
    mutationFn: (data: any) => request(`${basePath}/calculations/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations", orgSlug] }),
  });

  const deleteCalcMutation = useMutation({
    mutationFn: (id: string) => request(`${basePath}/calculations/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations", orgSlug] }),
  });

  const settingsQuery = useQuery({
    queryKey: ["calculator-settings", orgSlug],
    queryFn: () => request<any>(`${basePath}/calculator-settings/`),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => request(`${basePath}/calculator-settings/`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculator-settings", orgSlug] }),
  });

  const marketingData = marketingQuery.data ?? [];

  return {
    brochures: marketingData.filter(m => m.material_type === "BROCHURE") as Brochure[],
    videos: marketingData.filter(m => m.material_type === "VIDEO") as Video[],
    ads: marketingData.filter(m => m.material_type === "AD") as AdBanner[],
    marketingPending: marketingQuery.isPending,
    uploadMaterial: uploadMarketingMutation.mutate,
    deleteMaterial: deleteMarketingMutation.mutate,

    calculations: calcsQuery.data ?? [],
    calcsPending: calcsQuery.isPending,
    createCalculation: createCalcMutation.mutate,
    deleteCalculation: deleteCalcMutation.mutate,

    calculatorSettings: settingsQuery.data,
    settingsPending: settingsQuery.isPending,
    updateCalculatorSettings: updateSettingsMutation.mutate,
  };
}
