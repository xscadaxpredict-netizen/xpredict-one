/**
 * HTTP calls for Sales. No React in this file.
 *
 * Keeping it hook-free means these are reusable from a test, a loader or a
 * script, and it keeps the hooks layer purely about caching.
 *
 * Replace the hand-rolled fetch below with the generated client once the
 * backend is running and `npm run api:generate` has something to read.
 */

import { ApiError, type Problem } from "@xpredict/api-client";

import type { Enquiry, EnquiryFilters, NewEnquiry, Paginated } from "./types";

function base(orgSlug: string): string {
  // The org slug travels in the path, not the token (C2), so switching
  // organisation needs no new token — just a different URL.
  return `/api/v1/orgs/${encodeURIComponent(orgSlug)}/dms/sales`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    // Every failure is problem+json. If the body will not parse, something
    // upstream of the app answered (a proxy, a gateway) — do not guess at its
    // shape, fall back to an opaque error.
    const problem = (await response.json().catch(() => null)) as Problem | null;
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

  return (await response.json()) as T;
}

export function fetchEnquiries(
  orgSlug: string,
  filters: EnquiryFilters,
): Promise<Paginated<Enquiry>> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));

  const query = params.toString();
  return request<Paginated<Enquiry>>(
    `${base(orgSlug)}/enquiries${query ? `?${query}` : ""}`,
  );
}

export function fetchEnquiry(orgSlug: string, enquiryId: string): Promise<Enquiry> {
  return request<Enquiry>(`${base(orgSlug)}/enquiries/${enquiryId}`);
}

export function createEnquiry(orgSlug: string, body: NewEnquiry): Promise<Enquiry> {
  return request<Enquiry>(`${base(orgSlug)}/enquiries`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * One endpoint per user action, matching the backend's service function.
 * Not a generic PATCH: the server enforces that a closed enquiry cannot be
 * closed again, and a named endpoint is where that rule is visible.
 */
export function markEnquiryLost(
  orgSlug: string,
  enquiryId: string,
  reason: string,
): Promise<Enquiry> {
  return request<Enquiry>(`${base(orgSlug)}/enquiries/${enquiryId}/mark-lost`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
