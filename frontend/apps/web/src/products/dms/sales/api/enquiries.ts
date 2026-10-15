/**
 * Sales API functions. No React in this file.
 */

// Removed local ApiError import as it is in request.ts

import type {
  BankAccount,
  Enquiry,
  NewEnquiry,
  NewFollowup,
  NewQuotation,
  ProductPreset,
} from "./types";

import { request } from "../../shared/api/request";


// ---- API functions ---------------------------------------------------------

export async function fetchEnquiries(
  orgSlug: string,
): Promise<Enquiry[]> {
  return request<Enquiry[]>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/`);
}

export async function createEnquiry(
  orgSlug: string,
  body: NewEnquiry,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addFollowup(
  orgSlug: string,
  enquiryId: string,
  body: NewFollowup,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/followups/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateFollowup(
  orgSlug: string,
  enquiryId: string,
  followupId: string,
  body: Partial<NewFollowup>,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/followups/${followupId}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteFollowup(
  orgSlug: string,
  enquiryId: string,
  followupId: string,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/followups/${followupId}/`, {
    method: "DELETE",
  });
}

export async function saveQuotation(
  orgSlug: string,
  enquiryId: string,
  body: NewQuotation,
  existingQuoteId?: string,
): Promise<Enquiry> {
  const url = existingQuoteId 
    ? `/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/quotations/?quote_id=${existingQuoteId}`
    : `/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/quotations/`;
    
  return request<Enquiry>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function confirmOrder(
  orgSlug: string,
  enquiryId: string,
  quoteId: string,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/confirm/`, {
    method: "POST",
    body: JSON.stringify({ quote_id: quoteId }),
  });
}

export async function unconfirmOrder(
  orgSlug: string,
  enquiryId: string,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/unconfirm/`, {
    method: "POST",
  });
}

export async function deleteQuotation(
  orgSlug: string,
  enquiryId: string,
  quoteId: string,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/quotations/${quoteId}/`, {
    method: "DELETE",
  });
}

export async function deleteEnquiry(orgSlug: string, enquiryId: string): Promise<void> {
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/`, {
    method: "DELETE",
  });
}

export async function updateEnquiry(
  orgSlug: string,
  enquiryId: string,
  body: Partial<NewEnquiry>,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchBanks(
  orgSlug: string,
): Promise<BankAccount[]> {
  return request<BankAccount[]>(`/api/v1/orgs/${orgSlug}/dms/sales/banks/`);
}

export async function fetchProductPresets(
  orgSlug: string,
): Promise<ProductPreset[]> {
  return request<ProductPreset[]>(`/api/v1/orgs/${orgSlug}/dms/sales/products/`);
}


export async function confirmAmcQuote(
  orgSlug: string,
  enquiryId: string,
  quoteId: string,
): Promise<Enquiry> {
  return request<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries/${enquiryId}/quotations/${quoteId}/confirm-amc/`, {
    method: 'POST',
  });
}

// ---- Master Data (Bank Accounts & Products) --------------------------------

export async function createBank(
  orgSlug: string,
  body: Partial<BankAccount>,
): Promise<BankAccount> {
  return request<BankAccount>(`/api/v1/orgs/${orgSlug}/dms/sales/banks/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateBank(
  orgSlug: string,
  bankId: string,
  body: Partial<BankAccount>,
): Promise<BankAccount> {
  return request<BankAccount>(`/api/v1/orgs/${orgSlug}/dms/sales/banks/${bankId}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteBank(
  orgSlug: string,
  bankId: string,
): Promise<void> {
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/sales/banks/${bankId}/`, {
    method: "DELETE",
  });
}

export async function createProductPreset(
  orgSlug: string,
  body: Partial<ProductPreset> | FormData,
): Promise<ProductPreset> {
  const isFormData = body instanceof FormData;
  return request<ProductPreset>(`/api/v1/orgs/${orgSlug}/dms/sales/products/`, {
    method: "POST",
    body: isFormData ? body : JSON.stringify(body),
  });
}

export async function updateProductPreset(
  orgSlug: string,
  productId: string,
  body: Partial<ProductPreset> | FormData,
): Promise<ProductPreset> {
  const isFormData = body instanceof FormData;
  return request<ProductPreset>(`/api/v1/orgs/${orgSlug}/dms/sales/products/${productId}/`, {
    method: "PATCH",
    body: isFormData ? body : JSON.stringify(body),
  });
}

export async function deleteProductPreset(
  orgSlug: string,
  productId: string,
): Promise<void> {
  return request<void>(`/api/v1/orgs/${orgSlug}/dms/sales/products/${productId}/`, {
    method: "DELETE",
  });
}
