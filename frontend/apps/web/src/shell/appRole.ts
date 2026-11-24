/**
 * THE ROLE SOMEBODY HOLDS IN ONE APP, read from their membership (the owner,
 * 2026-11-24: "each app will have their own role"). `/me` sends it on each
 * app's entry; this is the one place that finds it, so a screen never digs
 * through `apps` by hand.
 *
 * The Admin panel is the app keyed "admin", so its role -- Organization Owner,
 * Organization Admin, one of the organisation's own -- is `adminPanelRole()`.
 * It replaces `Membership.admin_role` (C89).
 */

import type { AdminRole, AppKey, Membership } from "./api/auth";

/** Their role in `app`, or null (no role there, or an app they cannot open). */
export function appRole(membership: Membership, app: AppKey): AdminRole | null {
  return membership.apps.find((entry) => entry.key === app)?.role ?? null;
}

/** Their Admin panel role (C89), or null -- e.g. a dealer admin, who administers through DMS. */
export function adminPanelRole(membership: Membership): AdminRole | null {
  return appRole(membership, "admin");
}
