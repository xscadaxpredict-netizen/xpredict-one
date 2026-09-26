/**
 * Server state for Administration → Dealers.
 *
 * `useOrgQuery`, not TanStack's `useQuery` — ESLint refuses the raw hooks
 * outside the two pre-organisation auth files. The org is prepended to the
 * cache key by the hook, so a key without it is not something you can write.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import {
  createDealer,
  fetchDealers,
  setDealerStatus,
  type DealerStatus,
  type NewDealer,
} from "../api/dealers";

export const dealerKeys = {
  all: () => ["admin", "dealers"] as const,
};

interface UseDealersOptions {
  /** False while nothing needs them — the invite dialog only asks once open. */
  enabled?: boolean;
}

export function useDealers({ enabled = true }: UseDealersOptions = {}) {
  return useOrgQuery({
    key: dealerKeys.all(),
    queryFn: (orgSlug) => fetchDealers(orgSlug),
    enabled,
    // Dealerships open and close far less often than people come and go.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateDealer() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewDealer) => createDealer(orgSlug, body),
    invalidates: [dealerKeys.all()],
  });
}

export function useSetDealerStatus() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { dealerId: string; status: DealerStatus }) =>
      setDealerStatus(orgSlug, variables.dealerId, variables.status),
    invalidates: [dealerKeys.all()],
  });
}
