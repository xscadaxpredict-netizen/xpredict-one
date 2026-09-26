/**
 * Cache keys for Sales — module-relative.
 *
 * These deliberately do NOT contain the organisation. `useOrgQuery` prepends it,
 * which is what makes omitting it impossible rather than merely discouraged:
 * there is no signature anywhere that accepts a finished key.
 *
 * If you find yourself wanting the org in here, something has gone wrong —
 * check you are not calling TanStack Query directly (ESLint will tell you).
 */

import type { EnquiryFilters } from "./types";

export const salesKeys = {
  /** Everything this module caches. Invalidate to drop it all for one org. */
  all: () => ["dms", "sales"] as const,

  enquiries: () => [...salesKeys.all(), "enquiries"] as const,

  /** Filters belong in the key: they change which records come back. */
  list: (filters: EnquiryFilters) => [...salesKeys.enquiries(), "list", filters] as const,

  detail: (enquiryId: string) => [...salesKeys.enquiries(), "detail", enquiryId] as const,
};
