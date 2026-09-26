/**
 * Current user, current organisation, permission checks.
 *
 * Backed by GET /api/v1/me, which returns the user, their memberships and — for
 * the current organisation — role, unit, app access and permissions.
 *
 * Built out in Phase 4. The signatures below are the contract product modules
 * code against, so screens can be written now and filled in later.
 */

import { useParams } from "react-router-dom";

/**
 * The organisation slug for the current route.
 *
 * It lives in the URL, not in the token, so switching organisation is a
 * navigation rather than a re-authentication. Every query key and every API
 * call takes it — see CONTRIBUTING.md section 4.
 *
 * Throws rather than returning undefined. A component rendering outside an
 * org-scoped route is a routing bug, and a silent undefined would become the
 * literal string "undefined" in a URL — fetching nothing, failing quietly, and
 * taking an afternoon to find.
 */
export function useOrgSlug(): string {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  if (!orgSlug) {
    throw new Error(
      "useOrgSlug() was called outside an /:orgSlug route. Every product screen " +
        "must render inside the org-scoped shell.",
    );
  }

  return orgSlug;
}

export type AppCode = "dms" | "crm" | "ecom";

/**
 * Whether the current user may perform an action in an app.
 *
 * Hiding UI is a courtesy, never a control — the backend enforces every
 * permission regardless of what renders. Never leave an action visible because
 * "the API will reject it anyway", and never treat a hidden action as secured.
 */
export function usePermission(_app: AppCode, _permission: string): boolean {
  // Phase 4: read from the cached /me response.
  return true;
}
