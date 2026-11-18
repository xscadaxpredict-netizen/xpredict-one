/**
 * The organisation's profile, for the Admin panel's Organization -> Profile
 * page (C78). No React in this file.
 *
 * READ-ONLY, and only what the platform already stores (the owner,
 * 2026-11-17): no logo, no contact details, nothing to edit yet.
 *
 * HAND-WRITTEN TO MATCH `OrganizationProfileSerializer` in
 * `core/organizations/api/serializers.py` — C43 removed the generated client,
 * and a backend test pins the field names so the two cannot drift silently.
 */

import { request } from "@xpredict/api-client";

export interface OrganizationOwner {
  /** Their name, or their email address when they never gave one. */
  name: string;
  email: string;
}

export interface OrganizationProfile {
  name: string;
  /** The web address's last part: `/acme-water`. Set at signup, never changed. */
  slug: string;
  /** ISO 8601. */
  created_at: string;
  /** Whether the organisation's own database exists yet (C50). */
  is_ready: boolean;
  /** Null only for a broken record with no owner row. */
  owner: OrganizationOwner | null;
}

export async function fetchOrganizationProfile(orgSlug: string): Promise<OrganizationProfile> {
  return request<OrganizationProfile>(`/api/v1/orgs/${orgSlug}/admin/organization/`);
}
