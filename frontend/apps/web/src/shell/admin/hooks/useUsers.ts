/**
 * Server state for Administration → Users.
 *
 * Note what is NOT imported here: `useQuery` and `useMutation` from TanStack.
 * ESLint refuses those outside the two pre-organisation auth files.
 * `useOrgQuery` takes a module-relative key and prepends the organisation
 * itself, so a cache key without the org in it is not something you can
 * write — not something you must remember not to write.
 *
 * That matters more on this screen than on most. A user list keyed
 * `["admin","users"]` would serve one organisation's staff directory inside
 * another's the first time a multi-org admin switched in the topbar.
 */

import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import { fetchUnits, fetchUsers, inviteUser, type NewInvitation } from "../api/users";

/**
 * Module-relative cache keys. The organisation is prepended by the hooks, so
 * it must NOT appear here — including it twice would work, and then quietly
 * stop matching the day somebody invalidated the shorter version.
 */
export const adminKeys = {
  users: () => ["admin", "users"] as const,
  units: () => ["admin", "units"] as const,
};

export function useUsers() {
  return useOrgQuery({
    key: adminKeys.users(),
    queryFn: (orgSlug) => fetchUsers(orgSlug),
  });
}

/**
 * The dealers a person can be scoped to.
 *
 * Only fetched when the invite dialog is open: most visits to this screen are
 * to read the list, and a request nobody needed is still a request.
 */
export function useUnits(enabled: boolean) {
  return useOrgQuery({
    key: adminKeys.units(),
    queryFn: (orgSlug) => fetchUnits(orgSlug),
    enabled,
    // Dealers change far less often than people do.
    staleTime: 5 * 60 * 1000,
  });
}

export function useInviteUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewInvitation) => inviteUser(orgSlug, body),
    // Org-prefixed by the hook, so this refetches THIS organisation's users —
    // not every org cached in the browser session.
    invalidates: [adminKeys.users()],
  });
}
