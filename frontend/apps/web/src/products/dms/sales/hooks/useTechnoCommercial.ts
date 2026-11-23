/**
 * Server state hooks for Techno-Commercial documents.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";
import {
  deleteTechnoCommercialDocument,
  fetchTechnoCommercialDocuments,
  updateTechnoCommercialDocument,
  uploadTechnoCommercialDocument,
  type ListTechnoCommercialFilters,
} from "../api/technoCommercial";
import { salesKeys } from "../api/keys";

export function useTechnoCommercialDocuments(filters?: ListTechnoCommercialFilters) {
  return useOrgQuery({
    key: salesKeys.technoCommercialList(filters),
    queryFn: (orgSlug) => fetchTechnoCommercialDocuments(orgSlug, filters),
  });
}

export function useUploadTechnoCommercialDocument() {
  return useOrgMutation({
    mutationFn: (orgSlug, formData: FormData) =>
      uploadTechnoCommercialDocument(orgSlug, formData),
    invalidates: [salesKeys.technoCommercial()],
  });
}

export function useUpdateTechnoCommercialDocument() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { documentId: string; formData: FormData },
    ) => updateTechnoCommercialDocument(orgSlug, variables.documentId, variables.formData),
    invalidates: [salesKeys.technoCommercial()],
  });
}

export function useDeleteTechnoCommercialDocument() {
  return useOrgMutation({
    mutationFn: (orgSlug, documentId: string) =>
      deleteTechnoCommercialDocument(orgSlug, documentId),
    invalidates: [salesKeys.technoCommercial()],
  });
}

