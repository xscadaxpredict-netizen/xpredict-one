/**
 * Server state for the Admin panel's Applications page and its side panel.
 * `useOrgQuery` puts the organisation in the cache key.
 */

import { useOrgQuery } from "@xpredict/api-client";

import { fetchApplicationMembers, fetchApplications } from "../api/applications";

export const applicationKeys = {
  all: () => ["admin", "applications"] as const,
  members: (appCode: string) => ["admin", "applications", appCode, "members"] as const,
};

export function useApplications() {
  return useOrgQuery({
    key: applicationKeys.all(),
    queryFn: (orgSlug) => fetchApplications(orgSlug),
  });
}

export function useApplicationMembers(appCode: string) {
  return useOrgQuery({
    key: applicationKeys.members(appCode),
    queryFn: (orgSlug) => fetchApplicationMembers(orgSlug, appCode),
  });
}
