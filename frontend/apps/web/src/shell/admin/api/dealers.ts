/**
 * Dealers. No React in this file.
 *
 * A dealer is a `BusinessUnit` inside the organisation (C3, C7). It is NOT a
 * tenant — the organisation is the tenant and owns the database; dealers are
 * rows inside it. Getting that backwards is how you end up with a dealer that
 * can see another dealer's data, or a migration per dealership.
 *
 * DEALERS EXIST FOR DMS AND NOTHING ELSE. DMS is the only unit-aware app
 * (C5), so a dealer scopes somebody's DMS records and means nothing in CRM.
 * The invite dialog leans on that: the dealer picker is dead until DMS is
 * ticked.
 *
 * ORG-LEVEL, ON PURPOSE. Two-level administration (C3) means the organisation
 * creates and closes dealers, and each dealer then manages its own people.
 * That is why this screen is in Administration and not in DMS.
 */

import { ApiError, type Problem } from "@xpredict/api-client";

export type DealerStatus = "active" | "disabled";

export interface Dealer {
  id: string;
  /** How people refer to it: "Chennai — Guindy". */
  name: string;
  status: DealerStatus;
  /**
   * How many people are scoped to this dealer. A count rather than the list,
   * because the list belongs on Users where it can be searched and acted on.
   */
  user_count: number;
  /** ISO 8601, formatted for display at the edge. */
  created_at: string;
}

export interface NewDealer {
  name: string;
}

/* ------------------------------------------------------------------------ *
 * TEMPORARY FAKE — delete this whole block when the backend is running.
 *
 * Structured so deleting it is the entire switch: every function falls
 * through to a real request against the URL the backend will serve.
 * ------------------------------------------------------------------------ */
const USE_FAKE_DEALERS = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let fakeDealers: Dealer[] = [
  {
    id: "unit-1",
    name: "Chennai — Guindy",
    status: "active",
    user_count: 2,
    created_at: "2024-03-12T09:00:00Z",
  },
  {
    id: "unit-2",
    name: "Bangalore — Whitefield",
    status: "active",
    user_count: 1,
    created_at: "2024-07-01T09:00:00Z",
  },
  {
    id: "unit-3",
    name: "Coimbatore — Peelamedu",
    status: "active",
    user_count: 1,
    created_at: "2025-01-20T09:00:00Z",
  },
  {
    id: "unit-4",
    name: "Madurai — Ring Road",
    status: "disabled",
    user_count: 0,
    created_at: "2023-11-05T09:00:00Z",
  },
];

function fakeConflict(name: string): ApiError {
  return new ApiError({
    type: "https://api.xpredict.one/errors/dealer-name-taken",
    title: "Name already in use",
    status: 409,
    detail: `${name} already exists in this organisation.`,
    code: "dealer_name_taken",
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
    detail: "That dealer does not exist.",
    code: "not_found",
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

export async function fetchDealers(orgSlug: string): Promise<Dealer[]> {
  if (USE_FAKE_DEALERS) {
    await wait(500);
    return fakeDealers;
  }

  return request<Dealer[]>(`/api/v1/orgs/${orgSlug}/admin/dealers`);
}

export async function createDealer(orgSlug: string, body: NewDealer): Promise<Dealer> {
  if (USE_FAKE_DEALERS) {
    await wait(700);

    if (fakeDealers.some((dealer) => dealer.name.toLowerCase() === body.name.toLowerCase())) {
      throw fakeConflict(body.name);
    }

    const created: Dealer = {
      id: `unit-${String(fakeDealers.length + 1)}`,
      name: body.name,
      status: "active",
      user_count: 0,
      created_at: new Date().toISOString(),
    };

    fakeDealers = [...fakeDealers, created];
    return created;
  }

  return request<Dealer>(`/api/v1/orgs/${orgSlug}/admin/dealers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function setDealerStatus(
  orgSlug: string,
  dealerId: string,
  status: DealerStatus,
): Promise<Dealer> {
  if (USE_FAKE_DEALERS) {
    await wait(500);
    fakeDealers = fakeDealers.map((dealer) =>
      dealer.id === dealerId ? { ...dealer, status } : dealer,
    );

    const updated = fakeDealers.find((dealer) => dealer.id === dealerId);
    if (!updated) throw fakeNotFound();
    return updated;
  }

  /*
   * Two endpoints rather than one PATCH with a status field. The backend has
   * a rule per transition, and one endpoint per user action is what lets it
   * enforce that rule by name. A generic patch turns "close a dealership"
   * into "write any value into a column".
   */
  return request<Dealer>(
    `/api/v1/orgs/${orgSlug}/admin/dealers/${dealerId}/${status === "active" ? "reopen" : "close"}`,
    { method: "POST" },
  );
}
