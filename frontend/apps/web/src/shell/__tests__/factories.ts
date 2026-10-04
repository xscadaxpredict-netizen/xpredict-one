/**
 * Builders for `/me` responses.
 *
 * Tests describe only what they are about — "a dealer salesperson with Sales"
 * — and inherit the rest. Hand-written literals in every test mean adding one
 * field to `Me` breaks twenty tests, and the usual fix is a copy-paste that
 * quietly grants access the test never meant to grant.
 */

import type { AppAccess, AppKey, Me, Membership } from "../api/auth";

export function appAccess(key: AppKey, overrides: Partial<AppAccess> = {}): AppAccess {
  return {
    key,
    subscribed: true,
    accessible: true,
    summary: null,
    modules: [],
    permissions: [],
    ...overrides,
  };
}

export function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    org_id: "org-1",
    org_name: "Acme Motors",
    org_slug: "acme-motors",
    role: "member",
    unit_id: null,
    unit_name: null,
    apps: [],
    ...overrides,
  };
}

export function me(overrides: Partial<Me> = {}): Me {
  return {
    id: "user-1",
    email: "anita.f@acmemotors.in",
    first_name: "Anita",
    last_name: "Fernandes",
    memberships: [membership()],
    ...overrides,
  };
}

/** A dealer salesperson: DMS only, Sales only, no Administration. */
export function salespersonMembership(): Membership {
  return membership({
    role: "member",
    unit_id: "unit-1",
    unit_name: "Chennai — Guindy",
    apps: [
      appAccess("dms", {
        modules: ["sales"],
        permissions: ["dms.enquiry.create"],
      }),
      appAccess("crm", { accessible: false }),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      appAccess("admin", { accessible: false }),
    ],
  });
}

/**
 * An organisation owner: everything the organisation pays for.
 *
 * The permission lists here are deliberate SUBSETS — the real `/me` sends an
 * owner 33 DMS permissions and all 11 `admin.*` ones. Every string present is
 * a real one from the catalogue, which is the part that matters: a test that
 * grants an invented permission proves nothing about the product.
 */
export function ownerMembership(): Membership {
  return membership({
    role: "owner",
    apps: [
      appAccess("dms", {
        modules: ["sales", "service", "tech-support"],
        permissions: ["dms.enquiry.create"],
      }),
      appAccess("crm"),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      /*
       * Three modules, not five: `billing` and `audit` are out of the first
       * release (C38) and simply are not granted. The factory follows the fake
       * `/me`, so a test written against it describes the product that ships.
       */
      appAccess("admin", {
        modules: ["users", "dealers", "roles"],
        permissions: ["admin.person.invite", "admin.dealer.create", "admin.role.view"],
      }),
    ],
  });
}

/**
 * A dealer admin: Administration is open to them, but only its Users module
 * and only for their own dealer (C23). They can grant DMS and nothing else.
 *
 * STANDING IS `member`, NOT `admin` (C40). This read `role: "admin"` with a
 * dealership attached, which was correct under C31 and is now a row the
 * database REFUSES outright — `membership_org_standing_has_no_unit` requires
 * `unit_id IS NULL` for anything above `member`. What makes this person an
 * admin is holding the DMS System administrator role, which grants
 * `admin.person.*`; nothing is written into their standing.
 *
 * That is also why the permissions are spelled out here rather than left
 * empty: they are now the ONLY thing that distinguishes a dealer admin from a
 * salesperson, so a factory without them describes neither.
 */
export function dealerAdminMembership(): Membership {
  return membership({
    role: "member",
    unit_id: "unit-2",
    unit_name: "Bangalore — Whitefield",
    apps: [
      appAccess("dms", {
        modules: ["sales", "service"],
        permissions: ["dms.enquiry.view", "dms.jobcard.view"],
      }),
      appAccess("crm", { accessible: false }),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      appAccess("admin", {
        modules: ["users"],
        permissions: [
          "admin.person.view",
          "admin.person.invite",
          "admin.person.update",
          "admin.person.remove",
          "admin.person.set_status",
          "admin.person.resend_invitation",
        ],
      }),
    ],
  });
}
