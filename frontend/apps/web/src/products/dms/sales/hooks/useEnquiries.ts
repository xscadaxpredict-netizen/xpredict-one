/**
 * Server state for Sales — enquiries, followups, quotes.
 *
 * Uses useOrgQuery / useOrgMutation from @xpredict/api-client.
 * Never imports useQuery or useMutation directly — ESLint refuses it.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import {
  addFollowup,
  updateFollowup,
  deleteFollowup,
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
  createBank,
  updateBank,
  deleteBank,
  createProductPreset,
  updateProductPreset,
  deleteProductPreset,
} from "../api/enquiries";
import { salesKeys } from "../api/keys";
import type { NewEnquiry, NewFollowup, NewQuotation, BankAccount, ProductPreset } from "../api/types";

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
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useUpdateFollowup() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; followupId: string; body: Partial<NewFollowup> },
    ) => updateFollowup(orgSlug, variables.enquiryId, variables.followupId, variables.body),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useDeleteFollowup() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; followupId: string },
    ) => deleteFollowup(orgSlug, variables.enquiryId, variables.followupId),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
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
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useConfirmOrder() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; quoteId: string },
    ) => confirmOrder(orgSlug, variables.enquiryId, variables.quoteId),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useConfirmAmcQuote() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; quoteId: string },
    ) => confirmAmcQuote(orgSlug, variables.enquiryId, variables.quoteId),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useUnconfirmOrder() {
  return useOrgMutation({
    mutationFn: (orgSlug, enquiryId: string) =>
      unconfirmOrder(orgSlug, enquiryId),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useDeleteQuotation() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { enquiryId: string; quoteId: string },
    ) =>
      deleteQuotation(orgSlug, variables.enquiryId, variables.quoteId),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
  });
}

export function useDeleteEnquiry() {
  return useOrgMutation({
    mutationFn: (orgSlug, enquiryId: string) => deleteEnquiry(orgSlug, enquiryId),
    invalidates: [salesKeys.enquiries(), ["site-services"]],
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

// ---- Master Data Mutations -------------------------------------------------

export function useCreateBank() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: Partial<BankAccount>) => createBank(orgSlug, body),
    invalidates: [salesKeys.banks()],
  });
}

export function useUpdateBank() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { bankId: string; body: Partial<BankAccount> }) =>
      updateBank(orgSlug, variables.bankId, variables.body),
    invalidates: [salesKeys.banks()],
  });
}

export function useDeleteBank() {
  return useOrgMutation({
    mutationFn: (orgSlug, bankId: string) => deleteBank(orgSlug, bankId),
    invalidates: [salesKeys.banks()],
  });
}

export function useCreateProductPreset() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: Partial<ProductPreset> | FormData) =>
      createProductPreset(orgSlug, body),
    invalidates: [salesKeys.products()],
  });
}

export function useUpdateProductPreset() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { productId: string; body: Partial<ProductPreset> | FormData }) =>
      updateProductPreset(orgSlug, variables.productId, variables.body),
    invalidates: [salesKeys.products()],
  });
}

export function useDeleteProductPreset() {
  return useOrgMutation({
    mutationFn: (orgSlug, productId: string) => deleteProductPreset(orgSlug, productId),
    invalidates: [salesKeys.products()],
  });
}
