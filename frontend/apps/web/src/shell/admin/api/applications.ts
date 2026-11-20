/**
 * The organisation's applications, for the Admin panel's App Management ->
 * Applications page (C78). No React in this file.
 *
 * HAND-WRITTEN TO MATCH `ApplicationSerializer` in
 * `core/organizations/api/serializers.py` — C43 removed the generated client,
 * and a backend test pins the field names so the two cannot drift silently.
 */

import { request } from "@xpredict/api-client";

import type { AppKey } from "../../api/auth";
import type { OrganizationOwner } from "./organization";

export interface Application {
  /** The app's key; its description and initials come from the catalogue. */
  code: Exclude<AppKey, "admin">;
  name: string;
  /** An active subscription. A cancelled or never-bought app is inactive. */
  active: boolean;
  /** People who can open it today; 0 for an inactive app. */
  members: number;
  /** The organisation's owner, on an active app; null on an inactive one. */
  owner: OrganizationOwner | null;
}

export async function fetchApplications(orgSlug: string): Promise<Application[]> {
  return request<Application[]>(`/api/v1/orgs/${orgSlug}/admin/applications/`);
}

/** One person who can open an app, as its panel lists them. */
export interface ApplicationMember {
  /** The membership's id. */
  id: string;
  /** Their name, or their email address when they never gave one. */
  name: string;
  email: string;
  /** The owner holds every app by rule (C72), so may have no role here. */
  is_owner: boolean;
  /** Their role in this app — "Manager" — or null for an owner with no grant. */
  role: string | null;
  /** Where that role applies: "Delhi East"; the organisation's name for its root. */
  places: string[];
}

/**
 * Assign users (the owner, 2026-11-20): several people, one role, all or
 * nothing. `users` are ids as the Users list gives them -- a pending person's
 * is their invitation's.
 */
export async function assignUsersToApp(
  orgSlug: string,
  appCode: string,
  users: string[],
  role: string,
): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/admin/applications/${appCode}/members/`, {
    method: "POST",
    body: JSON.stringify({ users, role }),
  });
}

export async function fetchApplicationMembers(
  orgSlug: string,
  appCode: string,
): Promise<ApplicationMember[]> {
  return request<ApplicationMember[]>(
    `/api/v1/orgs/${orgSlug}/admin/applications/${appCode}/members/`,
  );
}
