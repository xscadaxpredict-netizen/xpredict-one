import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import { PEOPLE_CHANGED } from "../../../shell/admin/hooks/useUsers";
import {
  fetchDmsUsers,
  fetchInviteRoles,
  fetchPersonRoles,
  inviteDmsUser,
  removeDmsUser,
  setDmsUserStatus,
  updateDmsUser,
  type DmsUserEdit,
  type NewDmsInvitation,
} from "./api";

/** Keys for DMS settings, relative to the organisation (`useOrgQuery` prefixes it). */
export const dmsSettingsKeys = {
  users: () => ["dms", "settings", "users"] as const,
  inviteRoles: () => ["dms", "settings", "invite-roles"] as const,
  personRoles: (userId: string) => ["dms", "settings", "users", userId, "roles"] as const,
};

/** Everybody who holds DMS, the owner first (DMS settings -> Users). */
export function useDmsUsers() {
  return useOrgQuery({
    key: dmsSettingsKeys.users(),
    queryFn: (orgSlug) => fetchDmsUsers(orgSlug),
  });
}

/** The roles Add User may give: DMS's organisation-level roles. */
export function useDmsInviteRoles() {
  return useOrgQuery({
    key: dmsSettingsKeys.inviteRoles(),
    queryFn: (orgSlug) => fetchInviteRoles(orgSlug),
  });
}

/**
 * Invite somebody into DMS. The new person is ALSO a person in the Admin
 * panel's Users list (a pending one, holding DMS), so those lists refresh too.
 */
export function useInviteDmsUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, body: NewDmsInvitation) => inviteDmsUser(orgSlug, body),
    invalidates: DMS_PEOPLE_CHANGED,
  });
}

/** The roles Edit may give one person. */
export function useDmsPersonRoles(userId: string) {
  return useOrgQuery({
    key: dmsSettingsKeys.personRoles(userId),
    queryFn: (orgSlug) => fetchPersonRoles(orgSlug, userId),
  });
}

/*
 * Every change below is ALSO visible in the Admin panel (the person's name, or
 * their DMS tile), so those lists refresh with this one.
 */
const DMS_PEOPLE_CHANGED = [dmsSettingsKeys.users(), ...PEOPLE_CHANGED];

/** Edit: their details and DMS role. */
export function useUpdateDmsUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { userId: string; body: DmsUserEdit }) =>
      updateDmsUser(orgSlug, variables.userId, variables.body),
    invalidates: DMS_PEOPLE_CHANGED,
  });
}

/** Deactivate or Activate their DMS. */
export function useSetDmsUserStatus() {
  return useOrgMutation({
    mutationFn: (orgSlug, variables: { userId: string; action: "activate" | "deactivate" }) =>
      setDmsUserStatus(orgSlug, variables.userId, variables.action),
    invalidates: DMS_PEOPLE_CHANGED,
  });
}

/** Delete: take DMS away from them. */
export function useRemoveDmsUser() {
  return useOrgMutation({
    mutationFn: (orgSlug, userId: string) => removeDmsUser(orgSlug, userId),
    invalidates: DMS_PEOPLE_CHANGED,
  });
}
