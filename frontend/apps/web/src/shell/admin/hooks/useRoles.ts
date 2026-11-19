/**
 * Server state for the roles a person can be given inside an app.
 *
 * `useOrgQuery`, not TanStack's `useQuery` — ESLint refuses the raw hooks
 * outside the two pre-organisation auth files. The org is prepended to the
 * cache key by the hook, so a key without it is not something you can write.
 */

import { useOrgQuery } from "@xpredict/api-client";

import { fetchPanelRoles, fetchRoles } from "../api/roles";

export const roleKeys = {
  all: () => ["admin", "roles"] as const,
  panel: () => ["admin", "panel-roles"] as const,
};

interface UseRolesOptions {
  /** False while nothing needs them — the dialogs only ask once open. */
  enabled?: boolean;
}

export function useRoles({ enabled = true }: UseRolesOptions = {}) {
  return useOrgQuery({
    key: roleKeys.all(),
    queryFn: (orgSlug) => fetchRoles(orgSlug),
    enabled,
    /*
     * Reference data: built-in, identical for every organisation, and changing
     * only when Xpredict ships a new one (C28). An hour is still far more
     * often than it can actually change.
     *
     * STILL ORG-KEYED, despite being the same answer everywhere. The key is
     * not an optimisation — it is the thing that stops one organisation's
     * cached response being served to another, and the day roles stop being
     * identical is the day an unkeyed cache becomes a leak nobody looks for.
     */
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * The Admin panel's roles for its Roles tab, with how many people hold each.
 * NOT reference data like `useRoles`: the counts change whenever somebody is
 * invited, made an admin or removed, so the default freshness applies.
 */
export function usePanelRoles() {
  return useOrgQuery({
    key: roleKeys.panel(),
    queryFn: (orgSlug) => fetchPanelRoles(orgSlug),
  });
}
