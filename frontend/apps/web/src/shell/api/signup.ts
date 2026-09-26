/**
 * Sign-up: create an organisation and its owner. Once per organisation (C14).
 *
 * Everybody after the owner arrives by invitation, not through this screen —
 * the control plane allows exactly one owner Membership per organisation.
 *
 * Three calls because there are three steps, and each can fail differently:
 * the code can be spent, the email can be taken, and the tenant database takes
 * a moment to exist.
 */

import { ApiError, type Problem } from "@xpredict/api-client";

import { fakeSignIn } from "./auth";

export interface SignupDetails {
  organisation_name: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export interface SignupResult {
  org_slug: string;
  /** False while the Celery task is still creating the tenant database. */
  is_ready: boolean;
}

/**
 * "Acme Motors" -> "acme-motors".
 *
 * Shown live during sign-up because this ends up in every URL the customer
 * ever sees. The server derives it again and owns uniqueness — this is a
 * preview, not the decision.
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/* ------------------------------------------------------------------------ *
 * TEMPORARY FAKE — delete with the one in auth.ts when the backend runs.
 *
 *   XPRD-DEMO-2026  valid
 *   XPRD-USED-0001  already spent
 *   anything else   invalid
 * ------------------------------------------------------------------------ */
const USE_FAKE_SIGNUP = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function problem(status: number, code: string, detail: string): ApiError {
  return new ApiError({
    type: `https://api.xpredict.one/errors/${code.replace(/_/g, "-")}`,
    title: status === 409 ? "Conflict" : "Unprocessable entity",
    status,
    detail,
    code,
    trace_id: "fake-0000",
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Problem | null;
    throw new ApiError(
      body ?? {
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

/**
 * Check the activation code before showing the long form.
 *
 * Unlike login, the failures here are told apart deliberately. "Already used"
 * and "invalid" mean different things to someone who was handed this code by
 * your sales team, and being vague protects nobody — you gave them the code.
 */
export async function validateActivationCode(code: string): Promise<void> {
  if (USE_FAKE_SIGNUP) {
    await wait(500);
    const normalised = code.trim().toUpperCase();
    if (normalised === "XPRD-DEMO-2026") return;
    if (normalised === "XPRD-USED-0001") {
      throw problem(
        409,
        "activation_code_used",
        "This activation code has already been used. Contact your account manager for a new one.",
      );
    }
    throw problem(422, "activation_code_invalid", "That activation code is not valid.");
  }

  await request<void>("/api/v1/auth/activation-code/validate", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Create User + Organization + owner Membership — one request, one transaction.
 *
 * Returns `is_ready: false` when the tenant database is still being created.
 * That is not an error: signup committed, and a Celery task is provisioning
 * the database it will live in.
 */
export async function createOrganisation(
  code: string,
  details: SignupDetails,
): Promise<SignupResult> {
  if (USE_FAKE_SIGNUP) {
    await wait(900);
    if (details.email.trim().toLowerCase() === "taken@example.com") {
      throw problem(409, "email_taken", "An account with this email already exists.");
    }
    // Signing up signs you in — the real endpoint sets the cookie in its
    // response, so the fake has to do the equivalent or the new owner lands on
    // the launcher and is bounced straight back out to /login.
    fakeSignIn();
    return { org_slug: toSlug(details.organisation_name), is_ready: false };
  }

  return request<SignupResult>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ activation_code: code, ...details }),
  });
}

/**
 * Has the tenant database finished being created?
 *
 * Polled while the provisioning screen is shown. Each organisation gets its own
 * database (C1), created after signup commits — so for a few seconds the
 * account exists and its workspace does not.
 */
export async function checkProvisioning(orgSlug: string): Promise<boolean> {
  if (USE_FAKE_SIGNUP) {
    fakePollCount += 1;
    await wait(1200);
    return fakePollCount >= 3;
  }

  const result = await request<{ is_ready: boolean }>(
    `/api/v1/orgs/${encodeURIComponent(orgSlug)}/provisioning`,
  );
  return result.is_ready;
}

let fakePollCount = 0;
