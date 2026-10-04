/**
 * Server state for Sales — enquiries, followups, quotes.
 *
 * Uses useOrgQuery / useOrgMutation from @xpredict/api-client.
 * Never imports useQuery or useMutation directly — ESLint refuses it.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import {
  addFollowup,
  confirmOrder,
  confirmAmcQuote,
  createEnquiry,
  deleteQuotation,
  fetchBanks,
  fetchEnquiries,
  fetchProductPresets,
  saveQuotation,
  unconfirmOrder,
  deleteEnquiry,
  updateEnquiry,
} from "../api/enquiries";
import { salesKeys } from "../api/keys";
import type { NewEnquiry, NewFollowup, NewQuotation } from "../api/types";

// ---- Queries ---------------------------------------------------------------

export function useEnquiries() {
  return useOrgQuery({
    key: salesKeys.enquiryList(),
    queryFn: (orgSlug) => fetchEnquiries(orgSlug),
  });
}

export function useBanks() {
  return useOrgQuery({
    key: salesKeys.banks(),
    queryFn: (orgSlug) => fetchBanks(orgSlug),
  });
}

export function useProductPresets() {
  return useOrgQuery({
    key: salesKeys.products(),
    queryFn: (orgSlug) => fetchProductPresets(orgSlug),
  });
}

// ---- Mutations (one per user action) ---------------------------------------

export function useCreateEnquiry() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewEnquiry) => createEnquiry(orgSlug, body),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useAddFollowup() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; body: NewFollowup },
    ) => addFollowup(orgSlug, variables.enquiryId, variables.body),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useSaveQuotation() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: {
        enquiryId: string;
        body: NewQuotation;
        existingQuoteId?: string;
      },
    ) =>
      saveQuotation(
        orgSlug,
        variables.enquiryId,
        variables.body,
        variables.existingQuoteId,
      ),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useConfirmOrder() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; quoteId: string },
    ) => confirmOrder(orgSlug, variables.enquiryId, variables.quoteId),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useConfirmAmcQuote() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; quoteId: string },
    ) => confirmAmcQuote(orgSlug, variables.enquiryId, variables.quoteId),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useUnconfirmOrder() {
  return useOrgMutation({
    mutationFn: (orgSlug, enquiryId: string) =>
      unconfirmOrder(orgSlug, enquiryId),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useDeleteQuotation() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; quoteId: string },
    ) =>
      deleteQuotation(orgSlug, variables.enquiryId, variables.quoteId),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useDeleteEnquiry() {
  return useOrgMutation({
    mutationFn: (orgSlug, enquiryId: string) => deleteEnquiry(orgSlug, enquiryId),
    invalidates: [salesKeys.enquiries()],
  });
}

export function useUpdateEnquiry() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; body: Partial<NewEnquiry> },
    ) => updateEnquiry(orgSlug, variables.enquiryId, variables.body),
    invalidates: [salesKeys.enquiries()],
  });
}
