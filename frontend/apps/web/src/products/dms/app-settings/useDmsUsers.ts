import { useOrgMutation, useOrgQuery } from "@xpredict/api-client";

import { PEOPLE_CHANGED } from "../../../shell/admin/hooks/useUsers";
import { fetchDmsUsers, fetchInviteRoles, inviteDmsUser, type NewDmsInvitation } from "./api";

/** Keys for DMS settings, relative to the organisation (`useOrgQuery` prefixes it). */
export const dmsSettingsKeys = {
  users: () => ["dms", "settings", "users"] as const,
  inviteRoles: () => ["dms", "settings", "invite-roles"] as const,
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
    invalidates: [dmsSettingsKeys.users(), ...PEOPLE_CHANGED],
  });
}
