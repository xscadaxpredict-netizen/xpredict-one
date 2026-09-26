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

/** Active, invited but not yet accepted, or switched off. */
export type UserStatus = "active" | "invited" | "disabled";

export interface UserAppRole {
  /** Matches AppKey. A plain string so a new app does not need a frontend release. */
  app: string;
  /** The role's display name, decided by the backend. See the note above. */
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

  /** Organisation-level standing, distinct from any per-app role below. */
  role: "owner" | "admin" | "member";

  status: UserStatus;
  apps: UserAppRole[];
}

/** A dealer, for the scope picker. Named "unit" to match the backend (C7). */
export interface Unit {
  id: string;
  name: string;
}

export interface NewInvitation {
  first_name: string;
  last_name: string;
  email: string;
  /** Dealer id, or null for organisation-wide. */
  unit_id: string | null;
  /** App keys this person may open. Roles are assigned separately — see Q12. */
  app_keys: string[];
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

const FAKE_UNITS: Unit[] = [
  { id: "unit-1", name: "Chennai — Guindy" },
  { id: "unit-2", name: "Bangalore — Whitefield" },
  { id: "unit-3", name: "Coimbatore — Peelamedu" },
];

const FAKE_USERS: OrgUser[] = [
  {
    id: "user-1",
    first_name: "Rahul",
    last_name: "Kandaswamy",
    email: "rahul@acmemotors.in",
    unit_name: null,
    role: "owner",
    status: "active",
    apps: [
      { app: "dms", role: "Admin" },
      { app: "crm", role: "Admin" },
    ],
  },
  {
    id: "user-2",
    first_name: "Anita",
    last_name: "Fernandes",
    email: "anita.f@acmemotors.in",
    unit_name: "Chennai — Guindy",
    role: "member",
    status: "active",
    apps: [{ app: "dms", role: "Sales executive" }],
  },
  {
    id: "user-3",
    first_name: "Vikram",
    last_name: "Nair",
    email: "vikram.n@acmemotors.in",
    unit_name: "Bangalore — Whitefield",
    role: "admin",
    status: "active",
    apps: [{ app: "dms", role: "Dealer admin" }],
  },
  {
    id: "user-4",
    first_name: "Priya",
    last_name: "Raghunathan",
    email: "priya.r@acmemotors.in",
    unit_name: null,
    role: "member",
    status: "active",
    apps: [{ app: "crm", role: "Marketing" }],
  },
  {
    id: "user-5",
    first_name: "Sanjay",
    last_name: "Desai",
    email: "sanjay.d@acmemotors.in",
    unit_name: "Chennai — Guindy",
    role: "member",
    status: "invited",
    apps: [{ app: "dms", role: "Sales executive" }],
  },
  {
    id: "user-6",
    first_name: "Meera",
    last_name: "Krishnan",
    email: "meera.k@acmemotors.in",
    unit_name: "Coimbatore — Peelamedu",
    role: "member",
    status: "disabled",
    apps: [{ app: "dms", role: "Service advisor" }],
  },
];

/** Mutated by the fake invite so a new row appears without a page reload. */
let fakeUsers = [...FAKE_USERS];

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

export async function fetchUsers(orgSlug: string): Promise<OrgUser[]> {
  if (USE_FAKE_USERS) {
    await wait(600);
    return fakeUsers;
  }

  return request<OrgUser[]>(`/api/v1/orgs/${orgSlug}/admin/users`);
}

export async function fetchUnits(orgSlug: string): Promise<Unit[]> {
  if (USE_FAKE_USERS) {
    await wait(300);
    return FAKE_UNITS;
  }

  return request<Unit[]>(`/api/v1/orgs/${orgSlug}/admin/units`);
}

export async function setUserStatus(
  orgSlug: string,
  userId: string,
  status: Extract<UserStatus, "active" | "disabled">,
): Promise<OrgUser> {
  if (USE_FAKE_USERS) {
    await wait(500);
    fakeUsers = fakeUsers.map((user) => (user.id === userId ? { ...user, status } : user));

    const updated = fakeUsers.find((user) => user.id === userId);
    if (!updated) throw fakeNotFound();
    return updated;
  }

  /*
   * Two endpoints rather than one PATCH with a status field. The backend has a
   * rule per transition — you cannot disable the last owner — and one endpoint
   * per user action is what lets it enforce that rule by name (C9 and the
   * services convention). A generic patch turns "deactivate a person" into
   * "write any value into a column".
   */
  return request<OrgUser>(
    `/api/v1/orgs/${orgSlug}/admin/users/${userId}/${status === "active" ? "activate" : "deactivate"}`,
    { method: "POST" },
  );
}

export async function resendInvitation(orgSlug: string, userId: string): Promise<void> {
  if (USE_FAKE_USERS) {
    await wait(500);
    return;
  }

  await request<void>(`/api/v1/orgs/${orgSlug}/admin/users/${userId}/resend-invitation`, {
    method: "POST",
  });
}

export async function inviteUser(orgSlug: string, body: NewInvitation): Promise<OrgUser> {
  if (USE_FAKE_USERS) {
    await wait(700);

    if (fakeUsers.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
      throw fakeConflict(body.email);
    }

    const invited: OrgUser = {
      id: `user-${String(fakeUsers.length + 1)}`,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      unit_name: FAKE_UNITS.find((unit) => unit.id === body.unit_id)?.name ?? null,
      role: "member",
      // Invited, not active: the person has to accept before they exist as a
      // user anywhere. Showing them as active would be a lie the first time
      // somebody wondered why a new starter could not sign in.
      status: "invited",
      apps: body.app_keys.map((app) => ({ app, role: "Member" })),
    };

    fakeUsers = [...fakeUsers, invited];
    return invited;
  }

  return request<OrgUser>(`/api/v1/orgs/${orgSlug}/admin/invitations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
