/**
 * Authentication calls. No React in this file.
 *
 * TOKENS ARE NEVER HANDLED HERE (C12). Django sets httpOnly cookies that
 * JavaScript cannot read, so there is nothing to store, forward or refresh —
 * the browser attaches them on its own. That is why every request below sends
 * `credentials: "include"`: without it the browser withholds the cookie and
 * every call comes back 401, which is a baffling first bug.
 *
 * It is also why logout is a REQUEST. The frontend cannot delete an httpOnly
 * cookie; only the server that set it can clear it.
 */

import { ApiError, type Problem } from "@xpredict/api-client";

/** The apps the suite can offer. Administration is one of them, not a settings page. */
export type AppKey = "dms" | "crm" | "ecommerce" | "admin";

/**
 * Whether one app is available, and why not when it is not.
 *
 * TWO SEPARATE FACTS, deliberately not collapsed into one `visible` boolean:
 *
 *   subscribed — the ORGANISATION pays for this app.
 *   accessible — THIS PERSON is allowed into it.
 *
 * They produce different screens. An app the org has not bought is shown
 * disabled, because someone has to know it exists before they can ask for it.
 * An app the person simply lacks access to is hidden, because that is a
 * permission decision and advertising it is not a sales opportunity.
 *
 * Collapsing these into one flag loses that distinction permanently, and the
 * wrong half is the one that leaks who-can-do-what.
 */
export interface AppAccess {
  key: AppKey;
  subscribed: boolean;
  accessible: boolean;
  /**
   * A line of fact the SERVER knows and the frontend cannot, such as how many
   * dealers this org has. Static wording ("Dealership management") lives in the
   * frontend catalog instead — it is copy, not data.
   */
  summary: string | null;

  /**
   * Module keys inside this app that this person may open — "sales",
   * "service". A module they may not open is simply absent.
   *
   * Module keys are safe for the frontend to know because it already names
   * them: they are URL segments and they are in the catalog. Contrast
   * `permissions` below.
   */
  modules: string[];

  /**
   * What this person may DO, as opaque strings — "dms.enquiry.create".
   *
   * DELIBERATELY UNTYPED. The backend owns this vocabulary. If the frontend
   * declared a union of valid permission names, adding one server-side would
   * mean a frontend release before anybody could be granted it, and the two
   * lists would drift the first time somebody was in a hurry.
   *
   * It also means this mechanism could be built while Q11 (custom roles per
   * organisation) and Q12 (the permission list per role) are still open. The
   * machinery does not need the words.
   *
   * THIS IS A MIRROR, NOT A SOURCE. The same check exists in Django and Django
   * is the one that matters. If the two ever disagree, this is the bug.
   */
  permissions: string[];
}

export interface Membership {
  org_id: string;
  org_name: string;
  org_slug: string;
  role: "owner" | "admin" | "member";
  unit_name: string | null;
  /**
   * Per organisation, not per user. Subscriptions are bought by an org, so the
   * same person can have DMS in one and CRM in another. Hanging this off `Me`
   * would quietly show one organisation's apps while inside the other.
   */
  apps: AppAccess[];
}

export interface Me {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  memberships: Membership[];
}

export interface Credentials {
  email: string;
  password: string;
}

/* ------------------------------------------------------------------------ *
 * TEMPORARY FAKE — delete this whole block when the backend is running.
 *
 * The real flow cannot be exercised yet: Django does not set the cookies, and
 * MSW cannot stand in for it either (a service worker's Set-Cookie is not
 * applied by the browser). So this pretends, purely so the screen is usable
 * while we build it.
 *
 * To see the failure path, sign in with the password: wrong
 * ------------------------------------------------------------------------ */
const USE_FAKE_AUTH = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeProblem(): ApiError {
  const problem: Problem = {
    type: "https://api.xpredict.one/errors/invalid-credentials",
    title: "Authentication required",
    status: 401,
    // Deliberately identical for a wrong email and a wrong password. Saying
    // "no such account" confirms which addresses are real, which hands an
    // attacker your customer list one guess at a time.
    detail: "Email or password is incorrect.",
    code: "invalid_credentials",
    trace_id: "fake-0000",
  };
  return new ApiError(problem);
}

const FAKE_ME: Me = {
  id: "8f14e45f-ceea-467a-9f0a-1b2c3d4e5f60",
  email: "rahul@acmemotors.in",
  first_name: "Rahul",
  last_name: "Kandaswamy",
  memberships: [
    {
      org_id: "1a2b3c4d-0000-0000-0000-000000000001",
      org_name: "Acme Motors",
      org_slug: "acme-motors",
      role: "owner",
      unit_name: null,
      apps: [
        {
          key: "dms",
          subscribed: true,
          accessible: true,
          summary: "Sales · Service · Tech support across 12 dealers",
          modules: ["sales", "service", "tech-support", "settings"],
          permissions: [
            "dms.enquiry.create",
            "dms.enquiry.assign",
            "dms.quotation.create",
            "dms.unit.manage_people",
          ],
        },
        {
          key: "crm",
          subscribed: true,
          accessible: true,
          summary: "Organisation-wide — no dealer split",
          modules: [],
          permissions: [],
        },
        // Not bought. Shown disabled rather than hidden — see AppAccess above.
        {
          key: "ecommerce",
          subscribed: false,
          accessible: false,
          summary: null,
          modules: [],
          permissions: [],
        },
        // Never "bought": Administration comes with the platform and is gated
        // by role alone. Same two flags, so the launcher needs no special case.
        {
          key: "admin",
          subscribed: true,
          accessible: true,
          summary: "Organisation admins only",
          modules: ["people", "dealers", "roles", "billing", "audit"],
          permissions: ["org.dealer.create", "org.person.invite", "org.role.assign"],
        },
      ],
    },
  ],
};

/* ---------------------------- real shape -------------------------------- */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    // Required for httpOnly cookie auth. Omit it and the cookie is not sent.
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

export async function login(credentials: Credentials): Promise<void> {
  if (USE_FAKE_AUTH) {
    await wait(700);
    if (credentials.password === "wrong@123") throw fakeProblem();
    return;
  }

  // Returns no body worth reading: the value of this call is the Set-Cookie
  // header, which the browser stores and we never see.
  await request<void>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function fetchMe(): Promise<Me> {
  if (USE_FAKE_AUTH) {
    await wait(250);
    return FAKE_ME;
  }
  return request<Me>("/api/v1/me");
}

export async function logout(): Promise<void> {
  if (USE_FAKE_AUTH) {
    await wait(200);
    return;
  }
  await request<void>("/api/v1/auth/logout", { method: "POST" });
}
