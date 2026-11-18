/**
 * Server state for the Admin panel's Organization -> Profile page.
 *
 * `useOrgQuery`, which puts the organisation in the cache key, so switching
 * organisations can never show the previous one's profile.
 */

import { useOrgQuery } from "@xpredict/api-client";

import { fetchOrganizationProfile } from "../api/organization";

export const organizationKeys = {
  profile: () => ["admin", "organization", "profile"] as const,
};

export function useOrganizationProfile() {
  return useOrgQuery({
    key: organizationKeys.profile(),
    queryFn: (orgSlug) => fetchOrganizationProfile(orgSlug),
  });
}
