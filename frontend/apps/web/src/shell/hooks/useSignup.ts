/**
 * Sign-up hooks.
 *
 * Like `useAuth`, these use TanStack Query's raw hooks rather than
 * `useOrgQuery` — and for the same reason. Sign-up runs before an organisation
 * exists; in fact it is what *creates* one. There is nothing to scope a cache
 * key by, so the rule that protects every other key cannot apply.
 *
 * ESLint exempts this file by name. If you add another pre-organisation hooks
 * file, add it to the exemption deliberately rather than widening the pattern —
 * everything else in the shell (the admin console) is very much org-scoped.
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  checkProvisioning,
  createOrganisation,
  type SignupDetails,
  validateActivationCode,
} from "../api/signup";

export function useValidateActivationCode() {
  return useMutation({
    mutationFn: (code: string) => validateActivationCode(code),
  });
}

export function useCreateOrganisation() {
  return useMutation({
    mutationFn: ({ code, details }: { code: string; details: SignupDetails }) =>
      createOrganisation(code, details),
  });
}

/**
 * Poll until the tenant database exists.
 *
 * Each organisation gets its own database (C1), created by a Celery task after
 * signup commits — so for a few seconds the account is real and its workspace
 * is not. Sending someone straight in means errors on a database that does not
 * exist yet.
 *
 * Polling stops on its own: once this returns true the screen navigates away
 * and the component unmounts, which tears the interval down. No cleanup to
 * forget.
 */
export function useProvisioningStatus(orgSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["signup", "provisioning", orgSlug],
    queryFn: () => checkProvisioning(orgSlug),
    enabled,
    refetchInterval: 1500,
    // A failed poll is worth retrying quietly — provisioning is expected to
    // take a moment, and a transient error is not a reason to alarm anyone.
    retry: 3,
  });
}
