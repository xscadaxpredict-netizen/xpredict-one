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

import { ApiError, type Problem } from "@xpredict/api-client";

import { fakeDealerName } from "./dealers";
import { fakeRoleName } from "./roles";

/** Active, invited but not yet accepted, or switched off. */
export type UserStatus = "active" | "invited" | "disabled";

export interface UserAppRole {
  /** Matches AppKey. A plain string so a new app does not need a frontend release. */
  app: string;
  /** The role's display name, decided by the backend. See the note above. */
  role: string;
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
  apps: UserAppRole[];
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
   * WITH `unit_id` THIS IS WHAT MAKES A DEALER ADMIN (C31). `admin` with no
   * unit administers the organisation; `admin` with a unit administers that
   * dealership; `member` administers nothing.
   */
  role: "admin" | "member";
}

/* ------------------------------------------------------------------------ *
 * TEMPORARY FAKE — delete this whole block when the backend is running.
 *
 * Structured so that deleting it is the entire switch: every function below
 * falls through to a real request against the URL the backend will serve.
 *
 * The owner chose a hand-written fake over MSW here. The trade-off, recorded
 * so it is not a surprise later: intercepting the network would mean these
 * components never change when the API lands, whereas this block has to be
 * removed from each function by hand.
 * ------------------------------------------------------------------------ */
const USE_FAKE_USERS = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FAKE_USERS: OrgUser[] = [
  {
    id: "user-1",
    first_name: "Rahul",
    last_name: "Kandaswamy",
    email: "rahul@acmemotors.in",
    unit_name: null,
    unit_id: null,
    role: "owner",
    status: "active",
    apps: [
      { app: "dms", role: "Group operations" },
      { app: "crm", role: "CRM user" },
    ],
  },
  {
    id: "user-2",
    first_name: "Anita",
    last_name: "Fernandes",
    email: "anita.f@acmemotors.in",
    unit_name: "Chennai — Guindy",
    unit_id: "unit-1",
    role: "member",
    status: "active",
    apps: [{ app: "dms", role: "Sales representative" }],
  },
  {
    id: "user-3",
    first_name: "Vikram",
    last_name: "Nair",
    email: "vikram.n@acmemotors.in",
    unit_name: "Bangalore — Whitefield",
    unit_id: "unit-2",
    // `member`, NOT `admin` (C40). What makes them a dealer admin is the DMS
    // System administrator role below; standing is a separate axis and the
    // database refuses `admin` with a dealership attached.
    role: "member",
    status: "active",
    apps: [
      { app: "dms", role: "System administrator" },
      // Administration, narrowed to Users at their own dealer. Derived from
      // what that DMS role grants, never granted directly — see appsFor().
      { app: "admin", role: "Dealer admin" },
    ],
  },
  {
    id: "user-4",
    first_name: "Priya",
    last_name: "Raghunathan",
    email: "priya.r@acmemotors.in",
    unit_name: null,
    unit_id: null,
    role: "member",
    status: "active",
    apps: [{ app: "crm", role: "CRM user" }],
  },
  {
    id: "user-5",
    first_name: "Sanjay",
    last_name: "Desai",
    email: "sanjay.d@acmemotors.in",
    unit_name: "Chennai — Guindy",
    unit_id: "unit-1",
    role: "member",
    status: "invited",
    apps: [{ app: "dms", role: "Sales representative" }],
  },
  {
    id: "user-6",
    first_name: "Meera",
    last_name: "Krishnan",
    email: "meera.k@acmemotors.in",
    unit_name: "Coimbatore — Peelamedu",
    unit_id: "unit-3",
    role: "member",
    status: "disabled",
    apps: [{ app: "dms", role: "Service advisor" }],
  },
];

/**
 * Just enough of the dealer list to echo a name back. The real list lives in
 * `dealers.ts` — duplicated here only so the fake can answer without the two
 * fakes importing each other.
 */
/**
 * Northway, where the signed-in person is a DEALER ADMIN at Bangalore —
 * Whitefield (C23). They see their own dealer's people and nobody else's.
 *
 * THE REAL SCOPING IS SERVER-SIDE, from the caller's membership — not from
 * which organisation they asked about. Keyed by org here only because the
 * fake has no token to read, and a frontend that filtered this itself would
 * be a frontend deciding who may see whom.
 */
const FAKE_DEALER_USERS: OrgUser[] = [
  {
    id: "user-n1",
    first_name: "Vikram",
    last_name: "Nair",
    email: "vikram.n@northwayauto.in",
    unit_name: "Bangalore — Whitefield",
    unit_id: "unit-2",
    // `member`, NOT `admin` (C40). What makes them a dealer admin is the DMS
    // System administrator role below; standing is a separate axis and the
    // database refuses `admin` with a dealership attached.
    role: "member",
    status: "active",
    apps: [
      { app: "dms", role: "System administrator" },
      // Administration, narrowed to Users at their own dealer. Derived from
      // what that DMS role grants, never granted directly — see appsFor().
      { app: "admin", role: "Dealer admin" },
    ],
  },
  {
    id: "user-n2",
    first_name: "Deepa",
    last_name: "Rao",
    email: "deepa.r@northwayauto.in",
    unit_name: "Bangalore — Whitefield",
    unit_id: "unit-2",
    role: "member",
    status: "active",
    apps: [{ app: "dms", role: "Sales representative" }],
  },
];

/** Mutated by the fake invite so a new row appears without a page reload. */
let fakeUsers = [...FAKE_USERS];
let fakeDealerUsers = [...FAKE_DEALER_USERS];

function isDealerOrg(orgSlug: string): boolean {
  return orgSlug === "northway-auto";
}

function fakeOwnerProtected(): ApiError {
  return new ApiError({
    type: "https://api.xpredict.one/errors/owner-protected",
    title: "Cannot remove the owner",
    status: 422,
    detail:
      "The owner cannot be removed. Transfer ownership to somebody else first.",
    code: "owner_protected",
    trace_id: "fake-0000",
  });
}

function fakeNotFound(): ApiError {
  return new ApiError({
    type: "https://api.xpredict.one/errors/not-found",
    title: "Not found",
    status: 404,
    // Cross-scope access answers 404, never 403: a record the caller may not
    // see has to be indistinguishable from one that never existed.
    detail: "That user does not exist.",
    code: "not_found",
    trace_id: "fake-0000",
  });
}

function fakeConflict(email: string): ApiError {
  return new ApiError({
    type: "https://api.xpredict.one/errors/email-taken",
    title: "Email already in use",
    status: 409,
    detail: `${email} already belongs to someone in this organisation.`,
    code: "email_taken",
    trace_id: "fake-0000",
  });
}

/* ---------------------------- real shape -------------------------------- */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
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

export async function fetchUsers(orgSlug: string): Promise<OrgUser[]> {
  if (USE_FAKE_USERS) {
    await wait(600);
    return isDealerOrg(orgSlug) ? fakeDealerUsers : fakeUsers;
  }

  return request<OrgUser[]>(`/api/v1/orgs/${orgSlug}/admin/users`);
}

export async function updateUser(
  orgSlug: string,
  userId: string,
  body: UserDetails,
): Promise<OrgUser> {
  if (USE_FAKE_USERS) {
    await wait(700);

    const lists = isDealerOrg(orgSlug) ? fakeDealerUsers : fakeUsers;
    const existing = lists.find((user) => user.id === userId);
    if (!existing) throw fakeNotFound();

    // Uniqueness excludes the record being edited, or saving somebody without
    // touching their address collides with themselves.
    const others = lists.filter((user) => user.id !== userId);
    if (others.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
      throw fakeConflict(body.email);
    }

    const updated: OrgUser = {
      ...existing,
      first_name: body.first_name,
      last_name: body.last_name,
      // Only an outstanding invitation may change address — see UserDetails.
      email: existing.status === "invited" ? body.email : existing.email,
      unit_id: body.unit_id,
      unit_name: fakeDealerName(body.unit_id),
      role: existing.role === "owner" ? "owner" : body.role,
      /*
       * ROLES ARE NOW ASSIGNED, NOT PRESERVED — which amends C25.
       *
       * C25 said a per-app role could not be set "at all yet", because Q12 was
       * open and a picker would have meant the frontend inventing a vocabulary.
       * C32 settled the roles, so the form asks and this takes what it is
       * given. Promoting a salesperson to Dealer manager is an ordinary admin
       * act and there was nowhere to do it.
       *
       * Administration is still derived from `role`, exactly as on invite, so
       * the two forms cannot disagree about what an admin holds.
       */
      apps: appsFor(body.apps, body.role, body.unit_id),
    };

    if (isDealerOrg(orgSlug)) {
      fakeDealerUsers = fakeDealerUsers.map((user) => (user.id === userId ? updated : user));
    } else {
      fakeUsers = fakeUsers.map((user) => (user.id === userId ? updated : user));
    }

    return updated;
  }

  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}`, {
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
  if (USE_FAKE_USERS) {
    await wait(600);

    const lists = isDealerOrg(orgSlug) ? fakeDealerUsers : fakeUsers;
    const existing = lists.find((user) => user.id === userId);
    if (!existing) throw fakeNotFound();

    /*
     * Checked here as well as hidden in the UI. An organisation with no owner
     * has nobody who can appoint one (C14), and a request does not have to
     * come from our menu.
     */
    if (existing.role === "owner") throw fakeOwnerProtected();

    if (isDealerOrg(orgSlug)) {
      fakeDealerUsers = fakeDealerUsers.filter((user) => user.id !== userId);
    } else {
      fakeUsers = fakeUsers.filter((user) => user.id !== userId);
    }

    return;
  }

  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}`, { method: "DELETE" });
}

export async function setUserStatus( orgSlug: string, userId: string, status: Extract<UserStatus, "active" | "disabled">, ): Promise<OrgUser> {
  if (USE_FAKE_USERS) {
    await wait(500);
    fakeUsers = fakeUsers.map((user) => (user.id === userId ? { ...user, status } : user));
    fakeDealerUsers = fakeDealerUsers.map((user) =>
      user.id === userId ? { ...user, status } : user,
    );

    const updated = [...fakeUsers, ...fakeDealerUsers].find((user) => user.id === userId);
    if (!updated) throw fakeNotFound();
    return updated;
  }
  return request<OrgUser>(
    `/api/v1/orgs/${orgSlug}/admin/users/${userId}/${status === "active" ? "activate" : "deactivate"}`,
    { method: "POST" },
  );
}

export async function resendInvitation(orgSlug: string, userId: string): Promise<void> {
  if (USE_FAKE_USERS) {
    console.log("resend fake");
    await wait(500);
    return;
  }

  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/resend-invitation`, {
    method: "POST",
  });
}

/**
 * FAKE BACKEND ONLY: the apps a person ends up holding.
 *
 * Administration is never granted by the form and never stored as an app
 * grant. It is DERIVED, and C40 changed what from: the app appears when the
 * person holds any `admin.*` permission, whatever the source.
 *
 * Two sources, and they are the two branches below:
 *
 *   standing   — `admin` or `owner` on the membership, which also means no
 *                dealership, so they administer the whole organisation.
 *   a role     — DMS System administrator, which grants `admin.person.*`
 *                narrowed to that person's own dealership.
 *
 * IT USED TO READ `role === "admin"` ALONE (C31), when a dealer admin was
 * `admin` plus a dealership. That is now refused by the database, so this
 * function would have reported Administration for nobody at a dealership.
 *
 * Checking a role CODE here is fine in a way it would not be in a component:
 * this file is standing in for the server, and the server owns the vocabulary.
 * Django will read the permission registry rather than compare a string.
 */
function appsFor(
  grants: AppGrant[],
  role: "admin" | "member",
  unitId: string | null,
): UserAppRole[] {
  const products = grants
    .filter((grant) => grant.app !== "admin")
    .map((grant) => ({ app: grant.app, role: fakeRoleName(grant.role) }));

  if (role === "admin" && unitId === null) {
    return [...products, { app: "admin", role: "Organisation admin" }];
  }

  const administersTheirDealer = grants.some((grant) => grant.role === "dms.system_admin");

  if (administersTheirDealer) {
    return [...products, { app: "admin", role: "Dealer admin" }];
  }

  return products;
}



export async function inviteUser(orgSlug: string, body: NewInvitation): Promise<OrgUser> {
  if (USE_FAKE_USERS) {
    await wait(700);

    const existing = isDealerOrg(orgSlug) ? fakeDealerUsers : fakeUsers;
    if (existing.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
      throw fakeConflict(body.email);
    }

    const invited: OrgUser = {
      id: `user-${String(existing.length + 1)}-${String(Date.now())}`,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      unit_name: fakeDealerName(body.unit_id),
      unit_id: body.unit_id,
      role: body.role,
      status: "invited",
      apps: appsFor(body.apps, body.role, body.unit_id),
    };

    if (isDealerOrg(orgSlug)) {
      fakeDealerUsers = [...fakeDealerUsers, invited];
    } else {
      fakeUsers = [...fakeUsers, invited];
    }
    return invited;
  }

  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/invitations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
