/**
 * The one fetch every API module goes through, and the session refresh that
 * hangs off it.
 *
 * WHY IT IS HERE AND NOT IN EACH MODULE. There were six copies of this — in
 * `auth`, `signup`, `invitations`, and the three admin modules — identical
 * apart from comments and one variable name. Six copies of a rule is six
 * chances for one of them to miss the next thing every request has to do, and
 * the rule they were about to miss is the one below: a Users screen that
 * recovers from an expired token and a Dealers screen that does not is the
 * shape C54 found between two forms asking one question two different ways.
 *
 * The plumbing it wraps was already shared — `csrfHeaders`, `readBody`,
 * `ApiError` all live beside this file. The wrapper was the piece that never
 * got hoisted.
 */

import { readBody } from "./body";
import { csrfHeaders } from "./csrf";
import { ApiError, type Problem } from "./problem";

/**
 * Where the refresh lives. Pinned here rather than passed in: it is also the
 * one URL this file must NOT retry, and a caller that could change it could
 * break that.
 */
const REFRESH_URL = "/api/v1/auth/refresh/";

export interface RequestOptions extends RequestInit {
  /**
   * True for an endpoint where 401 is a real answer rather than an expired
   * session — signing in with the wrong password, or the invitation endpoints,
   * which are reached by people who are not signed in at all.
   *
   * DEFAULTS TO FALSE, SO FORGETTING IT FAILS SAFE: the worst case is one
   * wasted refresh that answers 401 and changes nothing. The opposite default
   * would mean a screen that silently stopped recovering, which is the bug
   * this whole file exists to fix.
   */
  public?: boolean;
}

/*
 * THE REFRESH IN FLIGHT, SHARED BY EVERY CALLER. This is not an optimisation.
 *
 * `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION` are both on, so every
 * refresh invalidates the token before it. A screen that fires three requests
 * at once gets three 401s at once; three independent refreshes would mean the
 * first succeeds and the other two present a token it has just blacklisted,
 * and the person is signed out BY THE THING MEANT TO KEEP THEM SIGNED IN.
 *
 * So the first caller starts the refresh and the rest wait on the same promise.
 */
let inFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(REFRESH_URL, {
      method: "POST",
      credentials: "include",
      // The refresh endpoint enforces CSRF by hand, and says why: it is the
      // endpoint that MINTS credentials.
      headers: { "Content-Type": "application/json", ...csrfHeaders("POST") },
    });
    return response.ok;
  } catch {
    // A network failure is not an expired session. Returning false sends the
    // original 401 to the caller, which is the honest answer; throwing here
    // would replace a clear "please sign in" with a fetch error.
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  inFlight ??= refreshSession().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test seam: forget any in-flight refresh. Not used by application code. */
export function resetSessionRefresh(): void {
  inFlight = null;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // Required for httpOnly cookie auth (C12). Omit it and the cookie is not
    // sent, and every call comes back 401.
    credentials: "include",
    // X-CSRFToken on anything that changes state. Django refuses an unsafe
    // request without it — which is what made logout answer 403 and leave
    // somebody signed in, the moment the fake stopped swallowing it.
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(init.method),
      ...init.headers,
    },
  });
}

/**
 * Fetch, with this project's non-negotiables applied and an expired access
 * token healed in passing.
 *
 * THE ACCESS COOKIE LASTS 15 MINUTES AND THE REFRESH COOKIE LASTS 7 DAYS, and
 * until this existed nothing ever spent the second one: the browser dropped
 * the access cookie, the next call answered 401, `useMe` read that as "not
 * signed in" and the shell sent a working session to the login screen. The
 * refresh endpoint had been built, tested four ways, and never called.
 *
 * ONE RETRY, NEVER A LOOP. If the replay is also refused, something other than
 * expiry is wrong — a disabled account, say — and retrying would hide it.
 */
export async function request<T>(url: string, init?: RequestOptions): Promise<T> {
  const { public: isPublic, ...rest } = init ?? {};

  let response = await send(url, rest);

  /*
   * `url !== REFRESH_URL` stops the obvious recursion: a refused refresh must
   * not trigger a refresh. Replaying `rest` is safe because every caller sends
   * a string body or none — a stream could not be read twice.
   */
  if (response.status === 401 && !isPublic && url !== REFRESH_URL && (await refreshOnce())) {
    response = await send(url, rest);
  }

  if (!response.ok) {
    /*
     * A problem+json body if there is one, a generic shape if there is not.
     * `.catch(() => null)` matters: a 502 from a proxy is HTML, and letting
     * `json()` throw would replace the server's status with a parse error.
     */
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

  // readBody, not response.json(): a 204 has no body and json() throws on one,
  // which reported a successful logout as a failure.
  return readBody<T>(response);
}
