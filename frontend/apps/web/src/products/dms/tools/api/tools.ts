import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../shared/api/request";
import type {
  Brochure,
  Video,
  AdBanner,
  FeasibilityReport,
  FeasibilityTemplate,
  CalculatedSpecs,
  FeasibilityAttachment,
  CalculatorSettingsData,
  ECDosingCalculation,
  CreateECDosingCalculationPayload,
} from "./types";

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

  // ---- EC Dosing Calculations --------------------------------------------
  const ecCalculationsQuery = useQuery({
    queryKey: ["ec-calculations", orgSlug],
    queryFn: () => request<ECDosingCalculation[]>(`${basePath}/ec-calculations/`),
  });

  const createEcCalculationMutation = useMutation({
    mutationFn: (data: CreateECDosingCalculationPayload) =>
      request<ECDosingCalculation>(`${basePath}/ec-calculations/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ec-calculations", orgSlug] }),
  });

  const deleteEcCalculationMutation = useMutation({
    mutationFn: (id: string) =>
      request(`${basePath}/ec-calculations/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ec-calculations", orgSlug] }),
  });

  const settingsQuery = useQuery({
    queryKey: ["calculator-settings", orgSlug],
    queryFn: () => request<CalculatorSettingsData>(`${basePath}/calculator-settings/`),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => request(`${basePath}/calculator-settings/`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculator-settings", orgSlug] }),
  });

  // ---- Feasibility Study Queries & Mutations ------------------------------
  const feasibilityTemplateQuery = useQuery({
    queryKey: ["feasibility-template", orgSlug],
    queryFn: () => request<FeasibilityTemplate>(`${basePath}/feasibility/template/`),
  });

  const updateFeasibilityTemplateMutation = useMutation({
    mutationFn: (data: Partial<FeasibilityTemplate>) =>
      request<FeasibilityTemplate>(`${basePath}/feasibility/template/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feasibility-template", orgSlug] }),
  });

  const feasibilityReportsQuery = useQuery({
    queryKey: ["feasibility-reports", orgSlug],
    queryFn: () => request<FeasibilityReport[]>(`${basePath}/feasibility/reports/`),
  });

  const createFeasibilityMutation = useMutation({
    mutationFn: (data: Partial<FeasibilityReport>) => request<FeasibilityReport>(`${basePath}/feasibility/reports/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feasibility-reports", orgSlug] }),
  });

  const updateFeasibilityMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeasibilityReport> }) =>
      request<FeasibilityReport>(`${basePath}/feasibility/reports/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feasibility-reports", orgSlug] }),
  });

  const deleteFeasibilityMutation = useMutation({
    mutationFn: (id: string) => request(`${basePath}/feasibility/reports/${id}/`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feasibility-reports", orgSlug] }),
  });

  const calculateLiveMutation = useMutation({
    mutationFn: (params: Record<string, any>) =>
      request<CalculatedSpecs>(`${basePath}/feasibility/calculate/`, {
        method: "POST",
        body: JSON.stringify(params),
      }),
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: ({ reportId, formData }: { reportId: string; formData: FormData }) =>
      request<FeasibilityAttachment>(`${basePath}/feasibility/reports/${reportId}/attachments/`, {
        method: "POST",
        body: formData,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feasibility-reports", orgSlug] }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ reportId, attachmentId }: { reportId: string; attachmentId: string }) =>
      request(`${basePath}/feasibility/reports/${reportId}/attachments/${attachmentId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feasibility-reports", orgSlug] }),
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

    ecCalculations: ecCalculationsQuery.data ?? [],
    ecCalculationsPending: ecCalculationsQuery.isPending,
    createEcCalculation: createEcCalculationMutation.mutateAsync,
    deleteEcCalculation: deleteEcCalculationMutation.mutateAsync,

    calculatorSettings: settingsQuery.data,
    settingsPending: settingsQuery.isPending,
    updateCalculatorSettings: updateSettingsMutation.mutate,

    feasibilityTemplate: feasibilityTemplateQuery.data,
    templatePending: feasibilityTemplateQuery.isPending,
    updateFeasibilityTemplate: updateFeasibilityTemplateMutation.mutateAsync,

    feasibilityReports: feasibilityReportsQuery.data ?? [],
    feasibilityPending: feasibilityReportsQuery.isPending,
    createFeasibilityReport: createFeasibilityMutation.mutateAsync,
    updateFeasibilityReport: updateFeasibilityMutation.mutateAsync,
    deleteFeasibilityReport: deleteFeasibilityMutation.mutateAsync,
    calculateLive: calculateLiveMutation.mutateAsync,
    isCalculatingLive: calculateLiveMutation.isPending,
    uploadAttachment: uploadAttachmentMutation.mutateAsync,
    deleteAttachment: deleteAttachmentMutation.mutateAsync,
  };
}
