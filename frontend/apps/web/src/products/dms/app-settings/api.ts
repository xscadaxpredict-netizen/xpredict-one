/**
 * DMS settings' endpoints (C78 amended): `/api/v1/orgs/<slug>/dms/settings/`.
 */

import { request } from "@xpredict/api-client";

/** Whether somebody can open DMS now: `inactive` is either switch off, `pending` not yet joined. */
export type AppUserStatus = "active" | "inactive" | "pending";

/**
 * One row of DMS settings -> Users. Mirrors `AppUserSerializer` in
 * `backend/products/dms/app_settings/api/serializers.py`.
 */
export interface AppUser {
  /** A membership id, or an invitation id for somebody pending. */
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  /** Every app has the owner by default: always the first row. */
  is_owner: boolean;
  /** Their DMS role. Null for the owner, who holds every app by rule. */
  role: { code: string; name: string } | null;
  /** Where DMS places them. Empty for the owner (everywhere) and the pending. */
  territories: string[];
  /** The same places with their ids, for Edit's Territory field (2026-11-24). */
  places: { id: string; name: string }[];
  /**
   * Apps they hold that ignore territories ("the Admin panel", "CRM"). While
   * they hold any, they can be placed only at the organisation (2026-11-24).
   */
  other_apps: string[];
  status: AppUserStatus;
  /**
   * Their DMS access itself, which Deactivate / Activate switch: `disabled`
   * after Deactivate. Null for the owner and the pending, who have none to
   * switch. `status` is also `inactive` when their whole ACCOUNT is off.
   */
  access_status: "active" | "disabled" | null;
}

export async function fetchDmsUsers(orgSlug: string): Promise<AppUser[]> {
  return request<AppUser[]>(`/api/v1/orgs/${orgSlug}/dms/settings/users/`);
}

/** A role Add User may give: DMS's organisation-level roles. */
export interface InvitableRole {
  code: string;
  name: string;
  /** One line on what the role does, shown under the picker. */
  summary: string;
}

export async function fetchInviteRoles(orgSlug: string): Promise<InvitableRole[]> {
  return request<InvitableRole[]>(`/api/v1/orgs/${orgSlug}/dms/settings/invite-roles/`);
}

/** What Add User sends. DMS is implied: they are added from it. */
export interface NewDmsInvitation {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

/** Invite somebody into DMS; answers with their new (pending) row. */
export async function inviteDmsUser(orgSlug: string, body: NewDmsInvitation): Promise<AppUser> {
  return request<AppUser>(`/api/v1/orgs/${orgSlug}/dms/settings/users/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** What Edit sends: their details, their DMS role and -- once joined -- where they work. */
export interface DmsUserEdit {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  /** Exactly these territories (none allowed). Left out: their places stay. */
  territories?: string[];
}

/** Edit: details and DMS role. Answers with their row. */
export async function updateDmsUser(
  orgSlug: string,
  userId: string,
  body: DmsUserEdit,
): Promise<AppUser> {
  return request<AppUser>(`/api/v1/orgs/${orgSlug}/dms/settings/users/${userId}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** The roles Edit may give this person: DMS's roles at the level they are placed. */
export async function fetchPersonRoles(orgSlug: string, userId: string): Promise<InvitableRole[]> {
  return request<InvitableRole[]>(`/api/v1/orgs/${orgSlug}/dms/settings/users/${userId}/roles/`);
}

/** Deactivate or Activate their DMS (not their account). Answers with their row. */
export async function setDmsUserStatus(
  orgSlug: string,
  userId: string,
  action: "activate" | "deactivate",
): Promise<AppUser> {
  return request<AppUser>(`/api/v1/orgs/${orgSlug}/dms/settings/users/${userId}/${action}/`, {
    method: "POST",
  });
}

/** Delete: take DMS away. They stay in the organisation; an only-DMS invitation is cancelled. */
export async function removeDmsUser(orgSlug: string, userId: string): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/dms/settings/users/${userId}/`, {
    method: "DELETE",
  });
}
