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

/** An organisation owner: everything the organisation pays for. */
export function ownerMembership(): Membership {
  return membership({
    role: "owner",
    apps: [
      appAccess("dms", {
        modules: ["sales", "service", "tech-support", "settings"],
        permissions: ["dms.enquiry.create", "dms.unit.manage_people"],
      }),
      appAccess("crm"),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      appAccess("admin", { modules: ["users", "dealers", "roles", "billing", "audit"] }),
    ],
  });
}

/**
 * A dealer admin: Administration is open to them, but only its Users module
 * and only for their own dealer (C23). They can grant DMS and nothing else.
 */
export function dealerAdminMembership(): Membership {
  return membership({
    role: "admin",
    unit_id: "unit-2",
    unit_name: "Bangalore — Whitefield",
    apps: [
      appAccess("dms", { modules: ["sales", "service"] }),
      appAccess("crm", { accessible: false }),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      appAccess("admin", { modules: ["users"] }),
    ],
  });
}
