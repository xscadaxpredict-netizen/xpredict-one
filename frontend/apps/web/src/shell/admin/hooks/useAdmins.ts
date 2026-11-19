/**
 * Server state for the Admin panel's Admins tab (C78).
 *
 * The cache key sits beside the Users list's (`adminKeys`), so the Users
 * page's actions -- invite, edit, deactivate, remove -- mark this list out of
 * date as well: any of them can change who is an admin.
 */

import { useOrgQuery } from "@xpredict/api-client";

import { fetchAdmins } from "../api/admins";
import { adminKeys } from "./useUsers";

export function useAdmins() {
  return useOrgQuery({
    key: adminKeys.admins(),
    queryFn: (orgSlug) => fetchAdmins(orgSlug),
  });
}
