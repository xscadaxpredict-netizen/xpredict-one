/**
 * The roles a person can hold inside an app. No React in this file.
 *
 * TWO DIFFERENT THINGS ARE CALLED "ROLE", and confusing them is the mistake
 * this file exists to make hard:
 *
 *   Membership.role  — owner / admin / member. Standing in the ORGANISATION,
 *                      and always organisation-wide: anything above `member`
 *                      must have no dealership attached (C40). Set on the
 *                      invite and edit forms directly.
 *
 *   AppAccess.role   — THIS. What you may do INSIDE an app: Sales
 *                      representative, Service advisor. Says nothing about
 *                      administering.
 *
 * THE TWO NEVER TOUCH and neither is derived from the other (C40). A dealer
 * admin is `member` + the DMS `System administrator` role; an ordinary
 * salesperson is `member` + `Sales representative`.
 *
 * This used to say a dealer admin was `admin` + `Dealer manager` — the C31
 * model, with two roles that no longer exist. The database now refuses
 * `admin` with a dealership attached outright.
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

import { ApiError, csrfHeaders, readBody, type Problem } from "@xpredict/api-client";

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

  // readBody, not response.json(): a 204 has no body and json() throws on
  // one, which reported a successful logout as a failure.
  return readBody<T>(response);
}

export async function fetchRoles(orgSlug: string): Promise<Role[]> {
  return request<Role[]>(`/api/v1/orgs/${orgSlug}/admin/roles/`);
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
