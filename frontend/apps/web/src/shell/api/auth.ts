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

import { ApiError, csrfHeaders, readBody, type Problem } from "@xpredict/api-client";

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
  /**
   * Standing in THIS organisation, and NOTHING ELSE (C40).
   *
   * READING THIS ALONE WILL MISLEAD YOU. `admin` always means the whole
   * organisation and never a single dealer: a membership above `member` must
   * have `unit_id` null, and the database refuses anything else. A DEALER
   * ADMIN IS `member` with a `unit_id`, made an admin by holding the DMS
   * System administrator role — so what somebody may DO is in
   * `apps[].permissions`, never here.
   *
   * This doc comment said the opposite until 2026-10-04, describing C31's
   * model where `admin` plus a dealership meant a dealer admin. C40 removed
   * that: the two axes never touch, and nothing writes standing when an app
   * role changes. The cost was accepted knowingly — a list showing standing
   * alone displays a dealer admin as "Member", which is a bug the owner found
   * and the reason lists must show what people do.
   */
  role: "owner" | "admin" | "member";

  /**
   * The dealer this membership is scoped to, or null for organisation-wide.
   *
   * The id as well as the name, because a dealer admin inviting somebody sends
   * their own unit — and sending a display name as an identifier is how you
   * get a record attached to the wrong dealer after a rename.
   */
  unit_id: string | null;
  unit_name: string | null;
  /**
   * Per organisation, not per user. Subscriptions are bought by an org, so the
   * same person can have DMS in one and CRM in another. Hanging this off `Me`
   * would quietly show one organisation's apps while inside the other.
   */
  apps: AppAccess[];

  /**
   * Whether this organisation's own database exists yet.
   *
   * PER ORGANISATION, NOT PER USER (C50). Somebody can belong to two
   * organisations with only one provisioned, so a single flag on `Me` would be
   * wrong for one of them.
   *
   * False is normal for a few seconds after signing up — each organisation
   * gets its own database (C1), created after signup commits — and permanent
   * if provisioning failed for good. The launcher refuses to open an app
   * either way: the first business query would hit a database that is not
   * there.
   */
  is_ready: boolean;
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
 * To see the failure path, sign in with the password: wrong@123
 *
 * IT HAS A REAL SIGNED-OUT STATE. An earlier version answered `/me` with a
 * user unconditionally, which made `/login` and `/signup` unreachable the
 * moment the shell started redirecting signed-in people away from them — you
 * could no longer look at the two screens you most want to look at while
 * building the UI.
 *
 * So the fake keeps a session flag. Sign in sets it, sign out clears it, and
 * `/me` refuses without it. `sessionStorage`, not `localStorage`: a fake
 * session should not outlive the browser tab and quietly convince somebody
 * the backend is working.
 * ------------------------------------------------------------------------ */
const USE_FAKE_AUTH = false;

const FAKE_SESSION_KEY = "xpredict-fake-session";

/** Storage throws in some privacy modes, and a dev fake must not crash the app. */
function setFakeSession(signedIn: boolean) {
  try {
    if (signedIn) sessionStorage.setItem(FAKE_SESSION_KEY, "1");
    else sessionStorage.removeItem(FAKE_SESSION_KEY);
  } catch {
    // Ignored: the fake degrades to "signed out", which is the safe direction.
  }
}

function hasFakeSession(): boolean {
  try {
    return sessionStorage.getItem(FAKE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** What the real `/me` returns when nobody is signed in. */
function fakeUnauthenticated(): ApiError {
  return new ApiError({
    type: "https://api.xpredict.one/errors/not-authenticated",
    title: "Authentication required",
    status: 401,
    detail: "Sign in to continue.",
    code: "not_authenticated",
    trace_id: "fake-0000",
  });
}

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
      is_ready: true,
      role: "owner",
      unit_id: null,
      unit_name: null,
      apps: [
        {
          key: "dms",
          subscribed: true,
          accessible: true,
          summary: "Sales · Service · Tech support across 12 dealers",
          modules: ["sales", "service", "tech-support"],
          permissions: [
            "dms.enquiry.create",
            "dms.enquiry.assign",
            "dms.quotation.create",
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
          /*
           * NOT IN THE FIRST RELEASE: `billing` and `audit` (C38). Their
           * screens still exist as placeholders and their routes are still
           * declared — they are simply not granted, so C20 drops the routes
           * and C22 leaves the sidebar silent about them.
           *
           * THIS IS THE MECHANISM DOING ITS JOB, not a workaround. Shipping a
           * feature later is the backend adding a word to this list; no
           * frontend release, nothing to delete and re-add.
           */
          modules: ["users", "dealers", "roles"],
          /*
           * A SUBSET of the 11 `admin.*` permissions the real `/me` sends an
           * owner — but every string is a real one from the catalogue.
           *
           * These read `org.dealer.create`, `org.person.invite` and
           * `org.role.assign` until 2026-10-04, and none of the three exists.
           * C42 put the scope OUT of permission names — there is one
           * `admin.person.invite`, narrowed by `Membership.unit_id` — and C42
           * claimed only one frontend string needed changing. It was four.
           *
           * `org.role.assign` was the worst of them: it is not a rename but a
           * capability nobody has. The catalogue holds `admin.role.view` and
           * nothing else, because C28 made the Roles screen read-only. A fake
           * promising it is the same shape of bug as the role summary that
           * advertised a password capability the platform forbids.
           */
          permissions: ["admin.person.invite", "admin.dealer.create", "admin.role.view"],
        },
      ],
    },
    /*
     * A SECOND ORGANISATION, so the switcher is visible while the UI is being
     * built — it only appears with two or more (C13).
     *
     * Not the expected shape of a real account: people are expected to belong
     * to one organisation each, which is why there is no picker screen. Delete
     * this entry to see the single-organisation case, where the topbar renders
     * plain text instead of a button.
     *
     * Deliberately different from Acme: fewer DMS modules and no Administration,
     * so switching visibly changes the sidebar and hides "Manage". A second
     * organisation identical to the first would prove nothing.
     */
    {
      org_id: "1a2b3c4d-0000-0000-0000-000000000002",
      org_name: "Northway Auto Group",
      org_slug: "northway-auto",
      /*
       * Deliberately NOT ready, so the launcher's guard is visible in the fake
       * without anybody having to edit this file. Switch to Northway in the
       * topbar to see it.
       */
      is_ready: false,
      /*
       * `member`, NOT `admin` (C40). This said `admin` with a dealership
       * attached, which was right under C31 and is now a row the database
       * refuses: `membership_org_standing_has_no_unit` requires `unit_id IS
       * NULL` for anything above `member`.
       *
       * So this fake described an impossible account — and the fakes are what
       * the backend gets built from. PR #12 fixed the dialogs, the Users list
       * and the table when C40 landed; this payload and the test factory were
       * the two places it missed.
       */
      role: "member",
      unit_id: "unit-2",
      unit_name: "Bangalore — Whitefield",
      apps: [
        {
          key: "dms",
          subscribed: true,
          accessible: true,
          summary: "Sales · Service across 3 dealers",
          modules: ["sales", "service"],
          permissions: ["dms.enquiry.create"],
        },
        { key: "crm", subscribed: false, accessible: false, summary: null, modules: [], permissions: [] },
        { key: "ecommerce", subscribed: false, accessible: false, summary: null, modules: [], permissions: [] },
        /*
         * A DEALER ADMIN, and the reason this second organisation is worth
         * having in the fake. Administration is open to them, but with one
         * module: their own dealer's people (C23). Switch to Northway in the
         * topbar to see that side of the product.
         */
        {
          key: "admin",
          subscribed: true,
          accessible: true,
          summary: "Your dealer’s people",
          modules: ["users"],
          /*
           * THE SAME SIX `admin.person.*` PERMISSIONS THE OWNER HOLDS, and
           * that is the point of C42 rather than an oversight. One permission
           * set, narrowed by `Membership.unit_id`: a dealer admin and an org
           * admin both hold `admin.person.invite`, and what differs is whose
           * people they reach. Spelling the scope into the name would make two
           * things that have to agree.
           *
           * They get `users` and not `dealers` or `roles` because those come
           * from standing, which they do not have.
           *
           * This read `unit.person.invite` — the one string C42 did flag.
           */
          permissions: [
            "admin.person.view",
            "admin.person.invite",
            "admin.person.update",
            "admin.person.remove",
            "admin.person.set_status",
            "admin.person.resend_invitation",
          ],
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

export async function login(credentials: Credentials): Promise<void> {
  if (USE_FAKE_AUTH) {
    await wait(700);
    if (credentials.password === "wrong@123") throw fakeProblem();
    setFakeSession(true);
    return;
  }

  // Returns no body worth reading: the value of this call is the Set-Cookie
  // header, which the browser stores and we never see.
  await request<void>("/api/v1/auth/login/", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function fetchMe(): Promise<Me> {
  if (USE_FAKE_AUTH) {
    await wait(250);
    if (!hasFakeSession()) throw fakeUnauthenticated();
    return FAKE_ME;
  }
  return request<Me>("/api/v1/me/");
}

/**
 * Sign the fake session in without a password.
 *
 * Only for sign-up, which creates an account and must land in it. Exported so
 * `signup.ts` does not reach into this module's storage key.
 */
export function fakeSignIn(): void {
  if (USE_FAKE_AUTH) setFakeSession(true);
}

export async function logout(): Promise<void> {
  if (USE_FAKE_AUTH) {
    await wait(200);
    setFakeSession(false);
    return;
  }
  await request<void>("/api/v1/auth/logout/", { method: "POST" });
}
