/**
 * Organisation users. No React in this file.
 *
 * THE MODEL, WHICH IS THE WHOLE POINT OF THIS SCREEN:
 *
 * A user belongs to the ORGANISATION, not to an app. There is no such thing
 * as "a CRM user" — there is a person in the organisation who has access to
 * CRM. One list of people, one place they are created.
 *
 * DMS IS THE EXCEPTION (C5, C7). It is the only unit-aware app, so a person
 * can be scoped to one dealer inside it: `unit_name` names that dealer, and
 * `null` means they act at organisation level. Dealers create their own
 * dealer-level users (C3); an organisation admin doing it from this screen is
 * an audited override, not the normal path.
 *
 * ROLE NAMES ARE OPAQUE STRINGS. Q11 (custom roles per organisation) and Q12
 * (the permission list per role) are open, so the frontend must not contain a
 * list of valid roles — it would be a guess, and it would drift from whatever
 * the backend settles on.
 */

import { request } from "@xpredict/api-client";

import type { AdminRole } from "../../api/auth";

/** Active, invited but not yet accepted, or switched off. */
export type UserStatus = "active" | "invited" | "disabled";

export interface UserAppRole {
  /** Matches AppKey. A plain string so a new app does not need a frontend release. */
  app: string;
  /**
   * The role's stable code — `dms.manager`. What the edit form matches on.
   *
   * IT USED TO BE THE NAME ALONE, and the edit dialog compared display strings
   * to work out which role somebody already held. That breaks the first time a
   * role is renamed, silently, by quietly offering them a different one.
   */
  role_code: string;
  /** The role's display name, decided by the backend (C19). Never parsed. */
  role_name: string;
  /**
   * "disabled" after the app tile's Disable: the grant keeps its role and
   * place but opens nothing until Enable. A pending person's apps are always
   * "active" -- there is nothing to disable before they join.
   */
  status: "active" | "disabled";
}

/**
 * One app granted, and the role held in it.
 *
 * REPLACED `app_keys: string[]`, which could only say *that* somebody had DMS
 * and never *as what* — so every grant landed with a placeholder role and the
 * only way to change it was not to. Access and role are one decision and
 * travel together; two parallel fields would eventually disagree about which
 * apps a person has.
 *
 * `role` is a role CODE from `admin/api/roles.ts`, not a display name. The
 * backend owns the vocabulary (C19, C32).
 */
export interface AppGrant {
  app: string;
  role: string;
}

export interface OrgUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;

  /**
   * The dealer this person is scoped to inside DMS, or null for
   * organisation-wide. Never set for CRM or E-commerce — those are not
   * unit-aware, so a unit here would be meaningless rather than restrictive.
   */
  unit_name: string | null;
  /** The id as well as the label — a name is not an identifier. */
  unit_id: string | null;

  /** Organisation-level standing, distinct from any per-app role below. */
  role: "owner" | "admin" | "member";
  /**
   * The Admin panel role they hold, by name, or null (C89) -- what the list and
   * the panel CALL them. `role` is "admin" only for the built-in Organization
   * Admin.
   */
  admin_role: AdminRole | null;

  status: UserStatus;
  /**
   * PRODUCTS ONLY. Administration never appears here — it is not an app you
   * can be granted (the backend refuses a payload that asks), and whether
   * somebody administers is `administers` below.
   */
  apps: UserAppRole[];

  /**
   * What this person administers, or null: the FACT, not the words (C53).
   *
   * The server used to send "Organisation admin" or "Dealer admin" as if they
   * were role names. They are not — there is no Role row for Administration
   * and there cannot be one, so those strings are copy describing a derived
   * state, and copy belongs here where fixing a typo is a frontend change.
   *
   * TWO SOURCES ON THE SERVER, and they stay independent (C40): standing
   * ("organisation"), or holding a role that grants `admin.*` at a dealership
   * ("dealer"). A dealer admin keeps `member` standing.
   */
  administers: "organisation" | "dealer" | null;
}

/**
 * Edit user (the owner, 2026-11-20): basic information only, as Zoho's.
 * Apps, dealer and admin standing each have their own action, and the server
 * REFUSES any other field rather than ignoring it.
 *
 * `email` is accepted only while an invitation is pending. Once somebody has
 * joined it is how they sign in, and changing it from an admin screen is an
 * account takeover with extra steps (C25).
 */
export interface UserDetails {
  first_name: string;
  last_name: string;
  email: string;
}

/**
 * Add User (C83, the owner 2026-11-20): a PERSON -- first name, last name,
 * email -- and nothing else, as Zoho's admin panel. No role, no dealership, no
 * apps: those are assigned afterwards, or come from an app's own invite. The
 * server REFUSES any other field rather than ignoring it.
 */
export interface NewInvitation {
  first_name: string;
  last_name: string;
  email: string;
}

/* ---------------------------- real shape -------------------------------- */

export async function fetchUsers(orgSlug: string): Promise<OrgUser[]> {
  return request<OrgUser[]>(`/api/v1/orgs/${orgSlug}/admin/users/`);
}

export async function updateUser(
  orgSlug: string,
  userId: string,
  body: UserDetails,
): Promise<OrgUser> {
  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Take somebody out of this organisation.
 *
 * NOT "delete the user". A person's account lives in the control database and
 * may belong to other organisations (C1); what this removes is the
 * MEMBERSHIP — their relationship with this one. They lose access here and
 * keep their account, which is the only coherent meaning of "remove" in a
 * system where one login spans several organisations.
 *
 * It also means their name stays on what they did. An enquiry raised by
 * A. Fernandes still says so after she leaves, because the record references
 * a person who still exists. Hard-deleting the account would either orphan
 * that history or take it with them, and neither is something an organisation
 * admin should be able to do by pressing a button in a list.
 *
 * For somebody who never accepted, this is simply cancelling the invitation:
 * there is no account yet and nothing references them.
 */
export async function removeUser(orgSlug: string, userId: string): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/`, { method: "DELETE" });
}

export async function setUserStatus( orgSlug: string, userId: string, status: Extract<UserStatus, "active" | "disabled">, ): Promise<OrgUser> {
  return request<OrgUser>(
    `/api/v1/orgs/${orgSlug}/admin/users/${userId}/${status === "active" ? "activate" : "deactivate"}/`,
    { method: "POST" },
  );
}

export async function resendInvitation(orgSlug: string, userId: string): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/resend-invitation/`, {
    method: "POST",
  });
}

/**
 * Assign applications to a person (C83): one or more apps, each with its role.
 * All or nothing; adds, never replaces. Answers with the person's row.
 */
export async function assignApps(
  orgSlug: string,
  userId: string,
  apps: AppGrant[],
): Promise<OrgUser> {
  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/apps/`, {
    method: "POST",
    body: JSON.stringify({ apps }),
  });
}

/* --------------- the app tile: Edit | Disable | Unassign ---------------- */

function appUrl(orgSlug: string, userId: string, app: string): string {
  return `/api/v1/orgs/${orgSlug}/admin/users/${userId}/apps/${app}/`;
}

/** The app tile's Edit: the role they hold in that one app. Answers with their row. */
export async function changeAppRole(
  orgSlug: string,
  userId: string,
  app: string,
  role: string,
): Promise<OrgUser> {
  return request<OrgUser>(appUrl(orgSlug, userId, app), {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

/** The app tile's Disable, or Enable to undo it. Answers with their row. */
export async function setAppStatus(
  orgSlug: string,
  userId: string,
  app: string,
  action: "disable" | "enable",
): Promise<OrgUser> {
  return request<OrgUser>(`${appUrl(orgSlug, userId, app)}${action}/`, { method: "POST" });
}

/** The app tile's Unassign: the app, its role and its places go. Answers with their row. */
export async function unassignApp(orgSlug: string, userId: string, app: string): Promise<OrgUser> {
  return request<OrgUser>(appUrl(orgSlug, userId, app), { method: "DELETE" });
}

export async function inviteUser(orgSlug: string, body: NewInvitation): Promise<OrgUser> {
  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/invitations/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * The invitation link for somebody who has not accepted yet (C56).
 *
 * ITS OWN REQUEST, not a field on the list. The link contains the token, and
 * the token is the credential that joins the organisation as that person — so
 * it travels when an admin presses Copy and not on every visit to the screen.
 *
 * COPY AND RESEND ARE DIFFERENT VERBS. This is a read and leaves the token
 * alone, so pressing Copy twice sends the same link; `resendInvitation` mints a
 * new one and kills the old, which is the only reason to press it.
 */
export async function fetchInviteLink(
  orgSlug: string,
  userId: string,
): Promise<{ link: string; expires_at: string }> {
  return request<{ link: string; expires_at: string }>(
    `/api/v1/orgs/${orgSlug}/admin/users/${userId}/invite-link/`,
  );
}
