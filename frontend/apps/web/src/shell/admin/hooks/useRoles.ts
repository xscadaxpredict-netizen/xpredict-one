/**
 * Server state for the roles a person can be given inside an app.
 *
 * `useOrgQuery`, not TanStack's `useQuery` — ESLint refuses the raw hooks
 * outside the two pre-organisation auth files. The org is prepended to the
 * cache key by the hook, so a key without it is not something you can write.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import {
  createPanelRole,
  deletePanelRole,
  fetchPanelRoles,
  fetchRoleBuilder,
  fetchRoles,
  type NewPanelRole,
  updatePanelRole,
} from "../api/roles";

export const roleKeys = {
  all: () => ["admin", "roles"] as const,
  panel: () => ["admin", "panel-roles"] as const,
  builder: () => ["admin", "role-builder"] as const,
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
export function usePanelRoles({ enabled = true }: UseRolesOptions = {}) {
  return useOrgQuery({
    key: roleKeys.panel(),
    queryFn: (orgSlug) => fetchPanelRoles(orgSlug),
    // False for somebody without `admin.role.view`: a request bound to 403.
    enabled,
  });
}

/** New Role's grid: the section tree and the roles to copy from. */
export function useRoleBuilder() {
  return useOrgQuery({
    key: roleKeys.builder(),
    queryFn: (orgSlug) => fetchRoleBuilder(orgSlug),
  });
}

/**
 * Save a new role. The Roles tab and the copy-from list both change, and so
 * may the pickers' catalogue once app roles can be built.
 */
export function useCreatePanelRole() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewPanelRole) => createPanelRole(orgSlug, body),
    invalidates: [roleKeys.panel(), roleKeys.builder(), roleKeys.all()],
  });
}

/** Edit Role. The row, its Modified By and its copy-from entry all change. */
export function useUpdatePanelRole() {
  return useOrgMutation({
    mutationFn: (orgSlug, { code, body }: { code: string; body: NewPanelRole }) =>
      updatePanelRole(orgSlug, code, body),
    invalidates: [roleKeys.panel(), roleKeys.builder(), roleKeys.all()],
  });
}

/**
 * Delete Role. The row and its copy-from entry go.
 *
 * `onDeleted` RUNS IN THE MUTATION'S OWN onSuccess, straight after the
 * refetches start -- not after `mutateAsync` resolves. The refetched list no
 * longer has the role, so the panel holding the ⋮ unmounts as soon as it
 * lands; navigating any later raced it and left "That role is not in …" on
 * screen (found by the test).
 */
export function useDeletePanelRole({ onDeleted }: { onDeleted?: () => void } = {}) {
  return useOrgMutation({
    mutationFn: (orgSlug, code: string) => deletePanelRole(orgSlug, code),
    invalidates: [roleKeys.panel(), roleKeys.builder(), roleKeys.all()],
    onSuccess: () => onDeleted?.(),
  });
}
