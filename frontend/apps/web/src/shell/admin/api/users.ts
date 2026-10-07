/**
 * Organisation users. No React in this file.
 *
 * THE MODEL, WHICH IS THE WHOLE POINT OF THIS SCREEN:
 *
 * A user belongs to the ORGANISATION, not to an app. There is no such thing
 * as "a CRM user" — there is a person in the organisation who has access to
 * CRM. One list of people, one place they are created.
 *
 * DMS IS THE EXCEPTION (C5, C7). It is the only unit-aware app, so a person
 * can be scoped to one dealer inside it: `unit_name` names that dealer, and
 * `null` means they act at organisation level. Dealers create their own
 * dealer-level users (C3); an organisation admin doing it from this screen is
 * an audited override, not the normal path.
 *
 * ROLE NAMES ARE OPAQUE STRINGS. Q11 (custom roles per organisation) and Q12
 * (the permission list per role) are open, so the frontend must not contain a
 * list of valid roles — it would be a guess, and it would drift from whatever
 * the backend settles on.
 */

import { ApiError, csrfHeaders, readBody, type Problem } from "@xpredict/api-client";


/** Active, invited but not yet accepted, or switched off. */
export type UserStatus = "active" | "invited" | "disabled";

export interface UserAppRole {
  /** Matches AppKey. A plain string so a new app does not need a frontend release. */
  app: string;
  /**
   * The role's stable code — `dms.manager`. What the edit form matches on.
   *
   * IT USED TO BE THE NAME ALONE, and the edit dialog compared display strings
   * to work out which role somebody already held. That breaks the first time a
   * role is renamed, silently, by quietly offering them a different one.
   */
  role_code: string;
  /** The role's display name, decided by the backend (C19). Never parsed. */
  role_name: string;
}

/**
 * One app granted, and the role held in it.
 *
 * REPLACED `app_keys: string[]`, which could only say *that* somebody had DMS
 * and never *as what* — so every grant landed with a placeholder role and the
 * only way to change it was not to. Access and role are one decision and
 * travel together; two parallel fields would eventually disagree about which
 * apps a person has.
 *
 * `role` is a role CODE from `admin/api/roles.ts`, not a display name. The
 * backend owns the vocabulary (C19, C32).
 */
export interface AppGrant {
  app: string;
  role: string;
}

export interface OrgUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;

  /**
   * The dealer this person is scoped to inside DMS, or null for
   * organisation-wide. Never set for CRM or E-commerce — those are not
   * unit-aware, so a unit here would be meaningless rather than restrictive.
   */
  unit_name: string | null;
  /** The id as well as the label — a name is not an identifier. */
  unit_id: string | null;

  /** Organisation-level standing, distinct from any per-app role below. */
  role: "owner" | "admin" | "member";

  status: UserStatus;
  /**
   * PRODUCTS ONLY. Administration never appears here — it is not an app you
   * can be granted (the backend refuses a payload that asks), and whether
   * somebody administers is `administers` below.
   */
  apps: UserAppRole[];

  /**
   * What this person administers, or null: the FACT, not the words (C53).
   *
   * The server used to send "Organisation admin" or "Dealer admin" as if they
   * were role names. They are not — there is no Role row for Administration
   * and there cannot be one, so those strings are copy describing a derived
   * state, and copy belongs here where fixing a typo is a frontend change.
   *
   * TWO SOURCES ON THE SERVER, and they stay independent (C40): standing
   * ("organisation"), or holding a role that grants `admin.*` at a dealership
   * ("dealer"). A dealer admin keeps `member` standing.
   */
  administers: "organisation" | "dealer" | null;
}

/**
 * The writable fields of a person's membership.
 *
 * NOT THEIR ACCOUNT. `first_name` and `last_name` belong to the person and
 * change everywhere; the scope, the apps and the organisation role belong to
 * this organisation's relationship with them (C1 — identity lives in the
 * control database, the Membership is what ties it to one organisation).
 *
 * `email` is here but only accepted while an invitation is outstanding. Once
 * somebody has accepted, their address is how they sign in, and changing it
 * silently is an account takeover with extra steps — that needs its own flow
 * with confirmation sent to the new address.
 *
 * `role` deliberately excludes "owner". There is exactly one owner per
 * organisation (C14, a conditional unique constraint), so appointing a new
 * one is a transfer rather than an edit, and doing it through this form would
 * quietly leave the organisation with two or none.
 */
export interface UserDetails {
  first_name: string;
  last_name: string;
  email: string;
  unit_id: string | null;
  /** Products and the role in each. Never "admin" — that follows from `role`. */
  apps: AppGrant[];
  role: "admin" | "member";
}

export interface NewInvitation {
  first_name: string;
  last_name: string;
  email: string;
  /** Dealer id, or null for organisation-wide. */
  unit_id: string | null;
  /**
   * The PRODUCTS this person may open and the role in each — dms, crm,
   * ecommerce. Never "admin": Administration is not a product and is not
   * granted here, it follows from `role` below (C17, C31).
   */
  apps: AppGrant[];
  /**
   * Standing in the organisation. Never "owner": there is exactly one per
   * organisation (C14), so appointing one is a transfer, not an invitation.
   *
   * IT IS STANDING AND NOTHING MORE (C40). `admin` always means the whole
   * organisation and is only valid with `unit_id` null — the database refuses
   * anything else. `member` administers nothing BY STANDING, which is not the
   * same as administering nothing: a dealer admin is `member` with a
   * dealership, and what makes them an admin is the DMS System administrator
   * role in `apps` above.
   *
   * This said `admin` with a unit administers that dealership, which was C31.
   * C40 removed the write-back from app role into standing, so the two never
   * touch and neither is derived from the other.
   */
  role: "admin" | "member";
}

/* ---------------------------- real shape -------------------------------- */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
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

export async function fetchUsers(orgSlug: string): Promise<OrgUser[]> {
  return request<OrgUser[]>(`/api/v1/orgs/${orgSlug}/admin/users/`);
}

export async function updateUser(
  orgSlug: string,
  userId: string,
  body: UserDetails,
): Promise<OrgUser> {
  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Take somebody out of this organisation.
 *
 * NOT "delete the user". A person's account lives in the control database and
 * may belong to other organisations (C1); what this removes is the
 * MEMBERSHIP — their relationship with this one. They lose access here and
 * keep their account, which is the only coherent meaning of "remove" in a
 * system where one login spans several organisations.
 *
 * It also means their name stays on what they did. An enquiry raised by
 * A. Fernandes still says so after she leaves, because the record references
 * a person who still exists. Hard-deleting the account would either orphan
 * that history or take it with them, and neither is something an organisation
 * admin should be able to do by pressing a button in a list.
 *
 * For somebody who never accepted, this is simply cancelling the invitation:
 * there is no account yet and nothing references them.
 */
export async function removeUser(orgSlug: string, userId: string): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/`, { method: "DELETE" });
}

export async function setUserStatus( orgSlug: string, userId: string, status: Extract<UserStatus, "active" | "disabled">, ): Promise<OrgUser> {
  return request<OrgUser>(
    `/api/v1/orgs/${orgSlug}/admin/users/${userId}/${status === "active" ? "activate" : "deactivate"}/`,
    { method: "POST" },
  );
}

export async function resendInvitation(orgSlug: string, userId: string): Promise<void> {
  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/resend-invitation/`, {
    method: "POST",
  });
}

export async function inviteUser(orgSlug: string, body: NewInvitation): Promise<OrgUser> {
  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/invitations/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
