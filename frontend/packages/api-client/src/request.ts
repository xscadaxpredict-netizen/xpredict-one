/**
 * The one fetch every API module goes through.
 *
 * WHY IT IS HERE AND NOT IN EACH MODULE. There were six copies of this — in
 * `auth`, `signup`, `invitations`, and the three admin modules — identical
 * apart from comments and one variable name. Six copies of a rule is six
 * chances for one of them to miss the next thing every request has to do, and
 * the rule they were ABOUT to miss is the session refresh: a Users screen that
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
 * Fetch, with this project's three non-negotiables applied.
 *
 * `credentials: "include"` — the access token is an httpOnly cookie (C12).
 * Omit it and the cookie is not sent, and every call comes back 401.
 *
 * `X-CSRFToken` on anything that changes state, via `csrfHeaders`. Django
 * refuses an unsafe request without it, which is what made logout answer 403
 * and leave somebody signed in the moment the fake stopped swallowing it.
 *
 * `readBody`, not `response.json()` — a 204 has no body and `json()` throws on
 * one, which reported a successful logout as a failure.
 */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(init?.method),
      ...init?.headers,
    },
  });

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

  return readBody<T>(response);
}
