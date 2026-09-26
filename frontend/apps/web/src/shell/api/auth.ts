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

export interface Membership {
  org_id: string;
  org_name: string;
  org_slug: string;
  role: "owner" | "admin" | "member";
  unit_name: string | null;
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
