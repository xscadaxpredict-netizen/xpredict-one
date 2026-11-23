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
  status: AppUserStatus;
}

export async function fetchDmsUsers(orgSlug: string): Promise<AppUser[]> {
  return request<AppUser[]>(`/api/v1/orgs/${orgSlug}/dms/settings/users/`);
}
