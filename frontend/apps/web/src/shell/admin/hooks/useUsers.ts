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
  assignApps,
  changeAppRole,
  fetchInviteLink,
  fetchUsers,
  inviteUser,
  removeUser,
  resendInvitation,
  setAppStatus,
  setUserStatus,
  unassignApp,
  updateUser,
  type AppGrant,
  type NewInvitation,
  type UserDetails,
  type UserStatus,
} from "../api/users";
import { assignUsersToApp } from "../api/applications";
import { applicationKeys } from "./useApplications";
import { roleKeys } from "./useRoles";

/**
 * Module-relative cache keys. The organisation is prepended by the hooks, so
 * it must NOT appear here — including it twice would work, and then quietly
 * stop matching the day somebody invalidated the shorter version.
 */
export const adminKeys = {
  users: () => ["admin", "users"] as const,
  /** The Admins tab (`useAdmins`). */
  admins: () => ["admin", "admins"] as const,
};

/**
 * WHAT A CHANGE TO A PERSON MAKES STALE: the Users list, and -- because any
 * person can be, become or stop being an admin -- the Admins tab and the
 * Roles tab's counts. One list, so a new action cannot forget one of them.
 */
export const PEOPLE_CHANGED = [adminKeys.users(), adminKeys.admins(), roleKeys.panel()];

export function useUsers() {
  return useOrgQuery({
    key: adminKeys.users(),
    queryFn: (orgSlug) => fetchUsers(orgSlug),
  });
}

export function useInviteUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewInvitation) => inviteUser(orgSlug, body),
    invalidates: PEOPLE_CHANGED,
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
    invalidates: PEOPLE_CHANGED,
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
    invalidates: PEOPLE_CHANGED,
  });
}

/**
 * Assign applications (C83). Besides a person, it changes who can open each
 * app, so the Applications page's counts and members reload too.
 */
export function useAssignApps() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { userId: string; apps: AppGrant[] }) =>
      assignApps(orgSlug, variables.userId, variables.apps),
    invalidates: [...PEOPLE_CHANGED, applicationKeys.all()],
  });
}

/*
 * THE APP TILE'S THREE ACTIONS (the owner, 2026-11-20). Each changes who can
 * open an app, like Assign applications, so the Applications page reloads too.
 */
const APP_CHANGED = [...PEOPLE_CHANGED, applicationKeys.all()];

export function useChangeAppRole() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { userId: string; app: string; role: string }) =>
      changeAppRole(orgSlug, variables.userId, variables.app, variables.role),
    invalidates: APP_CHANGED,
  });
}

export function useSetAppStatus() {
  return useOrgMutation({
    mutationFn: (
      orgSlug,
      variables: { userId: string; app: string; action: "disable" | "enable" },
    ) => setAppStatus(orgSlug, variables.userId, variables.app, variables.action),
    invalidates: APP_CHANGED,
  });
}

export function useUnassignApp() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { userId: string; app: string }) =>
      unassignApp(orgSlug, variables.userId, variables.app),
    invalidates: APP_CHANGED,
  });
}

/**
 * Applications -> an app -> Assign users. Here rather than in
 * `useApplications` because it changes people too, and `PEOPLE_CHANGED` lives
 * here (`useApplications` importing it back would be a cycle).
 */
export function useAssignUsersToApp() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { app: string; users: string[]; role: string }) =>
      assignUsersToApp(orgSlug, variables.app, variables.users, variables.role),
    invalidates: APP_CHANGED,
  });
}

export function useRemoveUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, userId: string) => removeUser(orgSlug, userId),
    invalidates: PEOPLE_CHANGED,
  });
}
