import { request } from "../../shared/api/request";

export interface TechnoCommercialDocument {
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_size: string;
  mime_type: string;
  notes: string;
  site?: string | null;
  site_name?: string;
  quotation?: string | null;
  quote_number?: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListTechnoCommercialFilters {
  search?: string;
}

export async function fetchTechnoCommercialDocuments(
  orgSlug: string,
  filters?: ListTechnoCommercialFilters,
): Promise<TechnoCommercialDocument[]> {
  const params = new URLSearchParams();
  if (filters?.search) {
    params.set("search", filters.search);
  }

  const queryString = params.toString() ? `?${params.toString()}` : "";
  return request<TechnoCommercialDocument[]>(
    `/api/v1/orgs/${orgSlug}/dms/sales/techno-commercial/${queryString}`,
  );
}

export async function uploadTechnoCommercialDocument(
  orgSlug: string,
  formData: FormData,
): Promise<TechnoCommercialDocument> {
  return request<TechnoCommercialDocument>(
    `/api/v1/orgs/${orgSlug}/dms/sales/techno-commercial/`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function updateTechnoCommercialDocument(
  orgSlug: string,
  documentId: string,
  formData: FormData,
): Promise<TechnoCommercialDocument> {
  return request<TechnoCommercialDocument>(
    `/api/v1/orgs/${orgSlug}/dms/sales/techno-commercial/${documentId}/`,
    {
      method: "PATCH",
      body: formData,
    },
  );
}

export async function deleteTechnoCommercialDocument(
  orgSlug: string,
  documentId: string,
): Promise<void> {
  return request<void>(
    `/api/v1/orgs/${orgSlug}/dms/sales/techno-commercial/${documentId}/`,
    {
      method: "DELETE",
    },
  );
}
