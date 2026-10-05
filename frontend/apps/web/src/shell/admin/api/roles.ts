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

import { ApiError, csrfHeaders, type Problem } from "@xpredict/api-client";

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
  /**
   * Whether holding this role makes the person an administrator of their
   * scope — at a dealership, that they can add and remove that dealership's
   * users.
   *
   * IT WRITES NOTHING INTO STANDING (C40). This said holding the role sets
   * `Membership.role: "admin"` with the dealership attached, which was C31 and
   * is now a row the database REFUSES: anything above `member` must have
   * `unit_id` null. Standing and app role are independent axes and neither is
   * derived from the other, so a dealer admin keeps `member` standing and is
   * an admin purely by holding this role.
   *
   * On the server this field is DERIVED, never stored — "does this role grant
   * any `admin.*` permission" (C44 makes it a join). So it cannot drift from
   * what the role actually grants.
   *
   * IT LIVES ON THE ROLE, not in the form. The form must not carry a list of
   * "roles that also make you an admin" — that is the backend's vocabulary
   * (C19), and a hardcoded role code here would be wrong the first time a role
   * was renamed or added. The form asks the role what it confers.
   */
  administers: boolean;
}

/* --------------------------------------------------------------------------
 * FAKE BACKEND — delete this block when the endpoint lands.
 * ------------------------------------------------------------------------ */
const USE_FAKE_ROLES = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The DMS roles (C32, revised by C35), plus CRM's single default.
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
    /*
     * RUNS THE BUSINESS, NOT THE SOFTWARE. Every module at this dealership,
     * but not its user accounts — those belong to System administrator below.
     *
     * It briefly carried `administers` and no longer does (C36). Splitting the
     * two is the separation a dealership actually has: the person hitting the
     * sales targets is rarely the person adding accounts.
     */
    code: "dms.manager",
    name: "Manager",
    app: "dms",
    level: "unit",
    summary: "Everything at this dealer except its user accounts.",
    administers: false,
  },
  {
    /*
     * THE ONE ROLE THAT ADMINISTERS THE DEALERSHIP.
     *
     * `administers` is what makes this more than a job title: holding it is
     * what a dealer admin IS (C40). It changes no other field — standing stays
     * `member`, and the capability comes from the `admin.person.*` permissions
     * this role grants. There is no separate "also let them manage users"
     * tick — that read as redundant beside a role that implies it, and as
     * contradictory when the two disagreed (C34).
     *
     * This said holding it "sets `Membership.role: admin` with the dealership
     * attached", which was C31's model. C40 removed that write-back because it
     * stored a derived value in a second column that then had to agree — and
     * the day somebody changed the role without recomputing standing, they
     * kept administrative standing they no longer earned.
     *
     * WHAT IS GIVEN UP, knowingly: a Sales representative who also hires
     * cannot be expressed. Administering travels with this role rather than
     * being grantable alongside any of them.
     *
     * IT DOES NOT SET PASSWORDS, and nothing here should say it does. Nobody
     * sets another person's credentials — an invitation goes out and they
     * choose their own (C14) — and a sign-in address is locked once accepted
     * (C25). Creating the account and assigning the role is the whole job.
     */
    code: "dms.system_admin",
    name: "System administrator",
    app: "dms",
    level: "unit",
    summary: "Creates user profiles and assigns roles at this dealer.",
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
    /*
     * The advisor books the work and raises the job card; the technician below
     * carries it out. Different people at a real dealership, and different
     * screens, so they are different roles rather than one "service" role.
     */
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
    /*
     * Tech support is its own MODULE (C18), not a corner of service, so it
     * keeps its own role. A technician works on vehicles; this answers
     * support tickets.
     */
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

/**
 * FAKE BACKEND ONLY: a role code as the server would return its display name.
 *
 * The forms send codes (`dms.sales_executive`); a stored user carries the name
 * the list shows. The real endpoint resolves this from the Role table, the way
 * it resolves `unit_name` from a dealership.
 *
 * IT READS THE LIST ABOVE rather than a second map of its own. `users.ts` used
 * to keep one, and adding a role there meant remembering to add it here too —
 * which was forgotten the first time it happened, so a brand new Dealer admin
 * showed up in the Users panel as the literal string "dms.dealer_admin".
 */
export function fakeRoleName(code: string): string {
  return FAKE_ROLES.find((role) => role.code === code)?.name ?? code;
}

/* ---------------------------- real shape -------------------------------- */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    // Required for httpOnly cookie auth (C12). Omit it and the cookie is not
    // sent, and every call comes back 401.
    credentials: "include",
    // X-CSRFToken on anything that changes state. Django refuses an unsafe
    // request without it -- which is what made logout answer 403 and leave
    // somebody signed in, the moment the fake stopped intercepting it.
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(init?.method),
      ...init?.headers,
    },
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
