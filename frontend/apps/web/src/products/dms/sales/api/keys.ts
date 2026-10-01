/**
 * Cache key factory for the Sales module.
 *
 * Module-relative — the organisation is prepended by useOrgQuery / useOrgMutation,
 * so it must NOT appear here.
 */

import type { EnquiryStatus } from "./types";

export interface EnquiryFilters {
  search?: string;
  status?: EnquiryStatus;
}

export const salesKeys = {
  all: () => ["dms", "sales"] as const,

  enquiries: () => [...salesKeys.all(), "enquiries"] as const,
  enquiryList: (filters?: EnquiryFilters) =>
    [...salesKeys.enquiries(), "list", filters] as const,

  banks: () => [...salesKeys.all(), "banks"] as const,
  products: () => [...salesKeys.all(), "products"] as const,
};
