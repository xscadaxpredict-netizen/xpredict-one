import { useOrgQuery } from "@xpredict/api-client";

import { fetchDmsUsers } from "./api";

/** Keys for DMS settings, relative to the organisation (`useOrgQuery` prefixes it). */
export const dmsSettingsKeys = {
  users: () => ["dms", "settings", "users"] as const,
};

/** Everybody who holds DMS, the owner first (DMS settings -> Users). */
export function useDmsUsers() {
  return useOrgQuery({
    key: dmsSettingsKeys.users(),
    queryFn: (orgSlug) => fetchDmsUsers(orgSlug),
  });
}
