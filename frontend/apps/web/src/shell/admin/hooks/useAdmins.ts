/**
 * Server state for the Admin panel's Admins tab (C78).
 *
 * The cache key sits beside the Users list's (`adminKeys`), so the Users
 * page's actions -- invite, edit, deactivate, remove -- mark this list out of
 * date as well: any of them can change who is an admin.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import {
  assignAdmin,
  changeAdminRole,
  fetchAdmins,
  unassignAdmin,
  type AssignAdmin,
} from "../api/admins";
import { adminKeys, PEOPLE_CHANGED } from "./useUsers";

export function useAdmins() {
  return useOrgQuery({
    key: adminKeys.admins(),
    queryFn: (orgSlug) => fetchAdmins(orgSlug),
  });
}

/**
 * Assign Admin (C89). Somebody becoming an admin changes the Admins tab, the
 * Users list (their role's name) and the Roles tab's counts -- PEOPLE_CHANGED.
 */
export function useAssignAdmin() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: AssignAdmin) => assignAdmin(orgSlug, body),
    invalidates: PEOPLE_CHANGED,
  });
}

/** Manage Roles: the same things go stale as Assign Admin. */
export function useChangeAdminRole() {
  return useOrgMutation({
    mutationFn: (orgSlug, { personId, role }: { personId: string; role: string }) =>
      changeAdminRole(orgSlug, personId, role),
    invalidates: PEOPLE_CHANGED,
  });
}

/**
 * Unassign. `onUnassigned` runs in the mutation's own onSuccess, before the
 * refetched Admins tab drops the row -- the same race Delete Role met.
 */
export function useUnassignAdmin({ onUnassigned }: { onUnassigned?: () => void } = {}) {
  return useOrgMutation({
    mutationFn: (orgSlug, personId: string) => unassignAdmin(orgSlug, personId),
    invalidates: PEOPLE_CHANGED,
    onSuccess: () => onUnassigned?.(),
  });
}
