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

import {
  fetchInviteLink,
  fetchUsers,
  inviteUser,
  removeUser,
  resendInvitation,
  setUserStatus,
  updateUser,
  type NewInvitation,
  type UserDetails,
  type UserStatus,
} from "../api/users";

/**
 * Module-relative cache keys. The organisation is prepended by the hooks, so
 * it must NOT appear here — including it twice would work, and then quietly
 * stop matching the day somebody invalidated the shorter version.
 */
export const adminKeys = {
  users: () => ["admin", "users"] as const,
};

export function useUsers() {
  return useOrgQuery({
    key: adminKeys.users(),
    queryFn: (orgSlug) => fetchUsers(orgSlug),
  });
}

export function useInviteUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewInvitation) => inviteUser(orgSlug, body),
    invalidates: [adminKeys.users()],
  });
}

/**
 * Switch a person off, or back on.
 *
 * One hook, two transitions, because they are the same user action seen from
 * either end — unlike invite, which is a different action with a different
 * rule behind it.
 */
export function useSetUserStatus() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { userId: string; status: Extract<UserStatus, "active" | "disabled"> },
    ) => setUserStatus(orgSlug, variables.userId, variables.status),
    invalidates: [adminKeys.users()],
  });
}

/**
 * Mint a fresh invitation link and kill the old one.
 *
 * NOT "send the email again" -- there is no email (C56). Resending replaces the
 * token, so the link an admin already sent stops working: it is the control for
 * "that went to the wrong person" or "it expired", and Copy is the one for
 * "send it again".
 *
 * Invalidates nothing: the list shows no field that changes, and a refetch that
 * cannot change anything is a request nobody needed.
 */
export function useResendInvitation() {
  return useOrgMutation({
    mutationFn: (orgSlug, userId: string) => resendInvitation(orgSlug, userId),
  });
}

/**
 * Fetch the invitation link, on demand.
 *
 * A MUTATION WRAPPING A GET, deliberately. The link carries the token, so it
 * is fetched when an admin presses Copy rather than sitting in the users list
 * waiting to be fetched on every visit to the screen -- and `useOrgQuery` would
 * need `enabled: false` plus a manual refetch to behave that way, which is the
 * same thing written less plainly.
 *
 * It changes nothing, so it invalidates nothing. Copy twice, same link.
 */
export function useInviteLink() {
  return useOrgMutation({
    mutationFn: (orgSlug, userId: string) => fetchInviteLink(orgSlug, userId),
  });
}

export function useUpdateUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { userId: string; body: UserDetails }) =>
      updateUser(orgSlug, variables.userId, variables.body),
    invalidates: [adminKeys.users()],
  });
}

export function useRemoveUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, userId: string) => removeUser(orgSlug, userId),
    invalidates: [adminKeys.users()],
  });
}
