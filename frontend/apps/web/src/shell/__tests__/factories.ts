/**
 * Builders for `/me` responses, and for the role catalogue.
 *
 * Tests describe only what they are about — "a dealer salesperson with Sales"
 * — and inherit the rest. Hand-written literals in every test mean adding one
 * field to `Me` breaks twenty tests, and the usual fix is a copy-paste that
 * quietly grants access the test never meant to grant.
 */

import type { Role } from "../admin/api/roles";
import type { AppAccess, AppKey, AppModule, Me, Membership } from "../api/auth";

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

/**
 * Modules with no sub-modules — DMS's shape until it moves onto the section
 * tree (C79): `modulesOf("sales", "service")`.
 */
export function modulesOf(...codes: string[]): AppModule[] {
  return codes.map((code) => ({ code, sub_modules: [] }));
}

/**
 * The Admin panel's whole tree, in menu order, as `/me` sends an owner or an
 * organisation admin (C79, `permissions/0017`-`0018`).
 */
export const ADMIN_PANEL_TREE: AppModule[] = [
  { code: "organization", sub_modules: [{ code: "profile", tabs: ["organization_info"] }] },
  { code: "app_management", sub_modules: [{ code: "application", tabs: [] }] },
  {
    code: "user_management",
    sub_modules: [
      { code: "user", tabs: [] },
      { code: "admins_and_roles", tabs: ["admin", "app_admin", "role"] },
    ],
  },
];

/** Users alone, under User Management: what `/me` sends a dealer admin (C79). */
export const USERS_ONLY_TREE: AppModule[] = [
  { code: "user_management", sub_modules: [{ code: "user", tabs: [] }] },
];

export function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    org_id: "org-1",
    org_name: "Acme Motors",
    org_slug: "acme-motors",
    role: "member",
    unit_id: null,
    unit_name: null,
    // Ready by default, because almost every test is about something else.
    // The not-ready case is the exception and says so where it is used.
    is_ready: true,
    // Same reasoning (C63): an open dealership is the ordinary case, and the
    // tests about a closed one set it where it matters.
    unit_closed: false,
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
        modules: modulesOf("sales"),
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
        modules: modulesOf("sales", "service", "tech-support"),
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
        modules: ADMIN_PANEL_TREE,
        permissions: [
          // Seeing the Users list: Assign users picks from it (C81).
          "admin.user.view",
          "admin.user.create",
          "admin.dealer.create",
          "admin.role.view",
          // Assign applications (C83), and the Applications panel's two tabs
          // (C79): the owner holds them by rule.
          "admin.user.assign_app",
          "admin.application.view_users",
          "admin.application.view_conditional_assignment",
        ],
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
 * `admin.user.*`; nothing is written into their standing.
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
        modules: modulesOf("sales", "service"),
        permissions: ["dms.enquiry.view", "dms.jobcard.view"],
      }),
      appAccess("crm", { accessible: false }),
      appAccess("ecommerce", { subscribed: false, accessible: false }),
      appAccess("admin", {
        modules: USERS_ONLY_TREE,
        permissions: [
          "admin.user.view",
          "admin.user.create",
          "admin.user.update",
          "admin.user.delete",
          "admin.user.deactivate",
          "admin.user.resend_invitation",
        ],
      }),
    ],
  });
}

/**
 * The nine built-in roles, in the order Django sends them.
 *
 * THE ORDER IS PART OF THE CONTRACT, not incidental. `rolesFor()` preserves
 * whatever order it is given, so this list is what a picker shows --- and the
 * alphabet gets it wrong, which is why `Role.display_order` exists on the
 * backend. Manager and System administrator sit together because C36 split
 * them into a pair, and Technician precedes Tech support because sorting them
 * the other way reads like a typo.
 *
 * IT MIRRORS `backend/core/permissions/catalogue.py` BY HAND, and nothing
 * checks that the two agree --- C43 removed the generated client, so this is
 * the same trade every other hand-written type in the frontend makes. The
 * backend pins the same order in `test_roles_api.py`; if these two ever
 * disagree, that test and this factory are where to look.
 *
 * It exists because `fetchRoles` reads Django now. Tests that open a role
 * picker used to get this list from the fake for free; they have to supply it
 * themselves, which is the correct shape anyway --- a test that needs a role
 * catalogue should say which one.
 */
export function roleCatalogue(): Role[] {
  return [
    {
      code: "dms.manager",
      name: "Manager",
      app: "dms",
      level: "unit",
      summary: "Everything at this dealer except its user accounts.",
      administers: false,
    },
    {
      code: "dms.system_admin",
      name: "System administrator",
      app: "dms",
      level: "unit",
      summary: "Creates user profiles and assigns roles at this dealer.",
      // The only role that administers, and derived on the server from
      // whether it grants any `admin.*` permission (C40, C44).
      administers: true,
    },
    {
      code: "dms.sales_representative",
      name: "Sales representative",
      app: "dms",
      level: "unit",
      summary: "Enquiries, quotations, orders and follow-ups.",
      administers: false,
    },
    {
      code: "dms.service_advisor",
      name: "Service advisor",
      app: "dms",
      level: "unit",
      summary: "Books appointments and raises job cards.",
      administers: false,
    },
    {
      code: "dms.technician",
      name: "Technician",
      app: "dms",
      level: "unit",
      summary: "Carries out the work recorded on job cards.",
      administers: false,
    },
    {
      code: "dms.tech_support",
      name: "Tech support",
      app: "dms",
      level: "unit",
      summary: "Support tickets.",
      administers: false,
    },
    {
      code: "dms.fleet_viewer",
      name: "Fleet viewer",
      app: "dms",
      level: "org",
      summary: "Reads every dealership. Changes nothing.",
      administers: false,
    },
    {
      code: "dms.group_operations",
      name: "Group operations",
      app: "dms",
      level: "org",
      summary: "Works across every dealership, not just one.",
      administers: false,
    },
    {
      code: "crm.member",
      name: "CRM user",
      app: "crm",
      level: "org",
      summary: "The whole organisation's contacts and deals.",
      administers: false,
    },
  ];
}
