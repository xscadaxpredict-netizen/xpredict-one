/**
 * Sales API functions. No React in this file.
 */

import { ApiError, type Problem } from "@xpredict/api-client";

import type {
  BankAccount,
  Enquiry,
  NewEnquiry,
  NewFollowup,
  NewQuotation,
  ProductPreset,
} from "./types";

/* ---------------------------- request helper -------------------------------- */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    // Required for httpOnly cookie auth (C12). Omit it and the cookie is not
    // sent, and every call comes back 401.
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    let problem: Problem | null = null;
    if (response.status !== 204) {
      problem = (await response.json().catch(() => null)) as Problem | null;
    }
    
    throw new ApiError(
      problem ?? {
        type: "about:blank",
        title: "Error",
        status: response.status,
        detail: "An unexpected error occurred.",
        code: "internal_error",
        trace_id: "",
      },
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}


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
