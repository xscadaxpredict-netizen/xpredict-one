/**
 * Server state for Sales — the only place enquiry data is fetched.
 *
 * Note what is NOT imported here: `useQuery` and `useMutation` from TanStack.
 * ESLint refuses those in product code. `useOrgQuery` takes a module-relative
 * key and prepends the organisation itself, so a key without the org is not
 * something you can write — not something you must remember not to write.
 *
 * Reads are queries, writes are mutations, and there is one mutation per user
 * action, mirroring the backend's one endpoint per user action. Not a generic
 * `useUpdateEnquiry` that patches arbitrary fields: the mutation's name is what
 * documents the rule the server enforces.
 */

import { useOrgMutation, useOrgQuery, useOrgQueryClient } from "@xpredict/api-client";

import {
  createEnquiry,
  fetchEnquiries,
  fetchEnquiry,
  markEnquiryLost,
} from "../api/enquiries";
import { salesKeys } from "../api/keys";
import type { EnquiryFilters, NewEnquiry } from "../api/types";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useEnquiries(filters: EnquiryFilters = {}) {
  return useOrgQuery({
    key: salesKeys.list(filters),
    queryFn: (orgSlug) => fetchEnquiries(orgSlug, filters),
  });
}

export function useEnquiry(enquiryId: string) {
  return useOrgQuery({
    key: salesKeys.detail(enquiryId),
    queryFn: (orgSlug) => fetchEnquiry(orgSlug, enquiryId),
    // A 404 here may mean the enquiry belongs to another dealer — the backend
    // returns 404 rather than 403 so existence does not leak. Either way it
    // will not appear on a retry, so do not spend attempts on it.
    retry: (failureCount: number) => failureCount < 2,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function useCreateEnquiry() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewEnquiry) => createEnquiry(orgSlug, body),
    // Org-prefixed by the hook, so this refetches THIS organisation's
    // enquiries — not every org cached in the browser session.
    invalidates: [salesKeys.enquiries()],
  });
}

export function useMarkEnquiryLost(enquiryId: string) {
  const { setData } = useOrgQueryClient();

  return useOrgMutation({
    mutationFn: (orgSlug, reason: string) => markEnquiryLost(orgSlug, enquiryId, reason),
    invalidates: [salesKeys.enquiries()],
    onSuccess: (updated) => {
      setData(salesKeys.detail(enquiryId), updated);
    },
    // Deliberately no optimistic update. The backend refuses this on an
    // already-closed enquiry, so showing success first would flash a state it
    // immediately reverts. Optimism is for toggles with no server-side rule.
  });
}
