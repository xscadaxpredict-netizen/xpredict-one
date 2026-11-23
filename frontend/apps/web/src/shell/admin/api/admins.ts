/**
 * The Admin panel's Admins tab (C78): the organisation's owner and its
 * organisation admins. No React in this file.
 *
 * ITS OWN ENDPOINT, NOT THE USERS LIST (C79: the server checks what the screen
 * does). `GET /admin/admins/` needs `admin.admin.view` -- the Admins tab's own
 * permission -- and sends only these people and only what the tab and its
 * panel show. Mirrors `AdminSerializer`; hand-written on both sides (C43).
 */

import { request } from "@xpredict/api-client";

import type { AdminRole } from "../../api/auth";

/** An app somebody manages, for the admin's side panel. */
export interface ManagedApp {
  code: string;
  name: string;
}

export interface Admin {
  /** The membership's id, or the invitation's while pending -- as on Users. */
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  /** The tab's filter: the owner, the built-in Organization Admin, or a custom role (C89). */
  role: "owner" | "admin" | "custom";
  /** The role they hold, by the name the Roles tab gives it. */
  admin_role: AdminRole;
  status: "active" | "disabled" | "invited";
  /**
   * Every app the organisation subscribes to for the owner (every app by rule)
   * and an Organization Admin (the whole organisation, C72) -- and NONE for a
   * custom role's holder, who does only what that role permits (C89). Sent
   * with the row, so the panel needs no second endpoint or permission.
   */
  apps_managed: ManagedApp[];
}

export async function fetchAdmins(orgSlug: string): Promise<Admin[]> {
  return request<Admin[]>(`/api/v1/orgs/${orgSlug}/admin/admins/`);
}

/** Assign Admin's form: people (membership ids) and ONE Admin panel role's code. */
export interface AssignAdmin {
  users: string[];
  role: string;
}

/**
 * Assign Admin (C89): one Admin panel role for several people, all or nothing.
 * Answers with the Admins tab as it now stands. Refused with 409 and a reason
 * (`already_an_admin`, `admin_not_joined`, `admin_at_dealership`), 403
 * `role_beyond_own_access`, or 404 for a role or person not found.
 */
export async function assignAdmin(orgSlug: string, body: AssignAdmin): Promise<Admin[]> {
  return request<Admin[]>(`/api/v1/orgs/${orgSlug}/admin/admins/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
