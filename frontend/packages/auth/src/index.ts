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

/**
 * The apps in the suite.
 *
 * "ecommerce", not "ecom": the URL segment, the catalog key, the `/me`
 * response and the tokens all say "ecommerce", and this was the only place
 * that disagreed. A value nothing else produces cannot match anything.
 *
 * "admin" is here too. Administration is an app (C17) — it appears in the
 * launcher and is entitled through the same `apps[]` as the rest — and leaving
 * it out made this type unusable for the one screen that gates on it.
 */
export type AppCode = "dms" | "crm" | "ecommerce" | "admin";

/**
 * Whether the current user may perform an action in an app.
 *
 * ⚠️ THIS IS A STUB THAT ALWAYS RETURNS TRUE. Anything gated on it is visible
 * to everybody. Do not build a new screen against it.
 *
 * ⚠️ AND IT IS NOW THE SECOND PERMISSION API. `shell/access.ts` has the real
 * one — `useAccess().can("dms.enquiry.create")` — reading the modules and
 * permissions `/me` actually returns (C19). Two of these is one too many, and
 * the reconciliation is deliberately not done here: permission work is paused
 * until the roles themselves are defined (Q11, Q12).
 *
 * When it resumes, the likely answer is that this function goes and product
 * code calls `useAccess` — but that means deciding whether a permission helper
 * belongs in a package or in the shell, which is a decision, not a tidy-up.
 * `products/dms/sales/screens/EnquiryListScreen.tsx` and CONTRIBUTING.md
 * section on permissions both need updating with it.
 *
 * Hiding UI is a courtesy, never a control — the backend enforces every
 * permission regardless of what renders. Never leave an action visible because
 * "the API will reject it anyway", and never treat a hidden action as secured.
 */
export function usePermission(_app: AppCode, _permission: string): boolean {
  // Phase 4: read from the cached /me response.
  return true;
}
