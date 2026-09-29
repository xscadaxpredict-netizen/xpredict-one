/**
 * The roles a person can hold inside an app. No React in this file.
 *
 * TWO DIFFERENT THINGS ARE CALLED "ROLE", and confusing them is the mistake
 * this file exists to make hard:
 *
 *   Membership.role  — owner / admin / member. Standing in the ORGANISATION:
 *                      may you administer it, and with a dealership attached,
 *                      may you administer that dealership (C31). Set on the
 *                      invite and edit forms directly.
 *
 *   AppAccess.role   — THIS. What you may do INSIDE an app: Sales executive,
 *                      Service advisor. Says nothing about administering.
 *
 * A dealer admin is typically `admin` + `Dealer manager`; an ordinary
 * salesperson is `member` + `Sales executive`. Neither implies the other.
 *
 * THE LIST COMES FROM THE SERVER, and the frontend must not hardcode it — the
 * same argument as the opaque permission strings in C19. A union type here
 * would mean a frontend release before anybody could be given a new role, and
 * the two lists would drift the first time somebody was in a hurry. Roles are
 * built-in and defined by Xpredict (C28), so this endpoint is reference data:
 * the same answer for every organisation, seeded by a data migration.
 *
 * WHAT EACH ROLE MAY ACTUALLY DO IS NOT HERE. `permissions` is Q12 and still
 * unanswered, which is exactly why the Roles screen cannot be built yet and
 * this select can. Assigning a role needs its name; displaying what it grants
 * needs the list.
 */

import { ApiError, type Problem } from "@xpredict/api-client";

/**
 * Whether a role scopes its holder to one dealership or to the whole
 * organisation (C7's `Role.level`).
 *
 * It is what makes the select honest: a dealer-scoped person can only hold a
 * `unit` role, and somebody organisation-wide can only hold an `org` one.
 * Offering the wrong ones would produce records the backend is right to refuse.
 */
export type RoleLevel = "org" | "unit";

export interface Role {
  /** Stable, the backend's vocabulary. Never parsed here. */
  code: string;
  /** What a person is shown: "Sales executive". */
  name: string;
  /** Which app it belongs to — dms, crm, ecommerce. */
  app: string;
  level: RoleLevel;
  /** One line under the name in the picker. Copy, not data. */
  summary: string;
}

/* --------------------------------------------------------------------------
 * FAKE BACKEND — delete this block when the endpoint lands.
 * ------------------------------------------------------------------------ */
const USE_FAKE_ROLES = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The five DMS roles of C32, plus CRM's single default.
 *
 * THE DEALERSHIP IS THE RECORD BOUNDARY (C32). A Sales executive sees all of
 * their dealership's enquiries, not only the ones assigned to them —
 * assignment says who is working a lead and hides nothing. So there is no
 * "own records only" role here and no permission for it; do not add one.
 *
 * Only Fleet viewer is `org`, and deliberately read-only: somebody
 * organisation-wide in DMS has no dealership to be scoped to, so
 * `resolve_allowed_units()` returns unrestricted and they see every
 * dealership's records (C7). Read-only is the only safe shape for that.
 *
 * CRM ships with one role because CRM comes later and E-commerce is deferred
 * (C4, C32) — the mechanism is per-app, the list simply is not needed yet.
 */
const FAKE_ROLES: Role[] = [
  {
    code: "dms.dealer_manager",
    name: "Dealer manager",
    app: "dms",
    level: "unit",
    summary: "Runs the dealership — sales, service and tech support.",
  },
  {
    code: "dms.sales_executive",
    name: "Sales executive",
    app: "dms",
    level: "unit",
    summary: "Enquiries, quotations, orders and follow-ups.",
  },
  {
    code: "dms.service_advisor",
    name: "Service advisor",
    app: "dms",
    level: "unit",
    summary: "Appointments and job cards.",
  },
  {
    code: "dms.tech_support_agent",
    name: "Tech support agent",
    app: "dms",
    level: "unit",
    summary: "Support tickets.",
  },
  {
    code: "dms.fleet_viewer",
    name: "Fleet viewer",
    app: "dms",
    level: "org",
    summary: "Reads every dealership. Changes nothing.",
  },
  {
    /*
     * The writing counterpart to Fleet viewer, and the reason there is now a
     * real choice at organisation level rather than one role stated at you.
     *
     * DELIBERATELY THE ONLY ONE. Somebody organisation-wide has no dealership,
     * so `resolve_allowed_units()` returns unrestricted (C7) — this role acts
     * across EVERY dealership at once. That is head-office staff processing
     * centrally, and it is powerful enough that a tier of similar roles would
     * be a liability rather than a convenience.
     */
    code: "dms.group_operations",
    name: "Group operations",
    app: "dms",
    level: "org",
    summary: "Works across every dealership, not just one.",
  },
  {
    code: "crm.member",
    name: "CRM user",
    app: "crm",
    level: "org",
    summary: "The whole organisation's contacts and deals.",
  },
];

/* ---------------------------- real shape -------------------------------- */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    // Required for httpOnly cookie auth (C12). Omit it and the cookie is not
    // sent, and every call comes back 401.
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as Problem | null;
    throw new ApiError(
      problem ?? {
        type: "about:blank",
        title: "Error",
        status: response.status,
        detail: "An unexpected error occurred.",
        code: "internal_error",
        trace_id: "",
      },
    );
  }

  return (await response.json()) as T;
}

export async function fetchRoles(orgSlug: string): Promise<Role[]> {
  if (USE_FAKE_ROLES) {
    await wait(150);
    return FAKE_ROLES;
  }

  return request<Role[]>(`/api/v1/orgs/${orgSlug}/admin/roles`);
}

/**
 * The roles that can actually be given for one app at one scope.
 *
 * `unitScoped` is whether the PERSON belongs to a dealership, not whether the
 * app has dealerships — a person scoped to one can hold only `unit` roles, and
 * somebody organisation-wide only `org` ones.
 *
 * Returns them in the order the server sent, which is the order they are meant
 * to be read in.
 */
export function rolesFor(roles: Role[], app: string, unitScoped: boolean): Role[] {
  return roles.filter((role) => role.app === app && role.level === (unitScoped ? "unit" : "org"));
}
