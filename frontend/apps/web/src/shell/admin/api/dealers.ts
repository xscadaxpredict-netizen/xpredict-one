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

import { ApiError, csrfHeaders, readBody, type Problem } from "@xpredict/api-client";

export type DealerStatus = "active" | "disabled";

export interface Dealer {
  id: string;
  /** How people refer to it: "Chennai — Guindy". */
  name: string;

  /**
   * A short identifier the business chooses: "CHN-GUI".
   *
   * Optional, but unique within the organisation when given — it is the thing
   * that ends up on paperwork and in conversation, and two dealerships
   * answering to the same code is a filing problem nobody notices until an
   * invoice goes to the wrong branch.
   */
  code: string | null;

  /*
   * NO PARENT DEALERSHIP. Dealers are a FLAT LIST, not a tree (C29).
   *
   * There was a `parent_id` here and the form offered it, but what a parent
   * actually means was never settled (Q22) — whether a parent's admin manages
   * its branches' people, whether records roll up, how deep it may go. A field
   * that is stored and displayed and confers nothing is decoration, and the
   * conservative direction was to remove it until the question has an answer.
   *
   * Recoverable: it is in the history of `feat/app-shell`, with the cycle rule
   * and its tests. Do not re-add it without answering Q22 first.
   */

  /** Who to call at this dealership. A person, not a department. */
  contact_person: string;
  /** Where official correspondence goes — not necessarily anyone's login. */
  email: string;
  phone: string;

  city: string;
  state: string;
  postal_code: string;

  status: DealerStatus;
  /**
   * How many people are scoped to this dealer. A count rather than the list,
   * because the list belongs on Users where it can be searched and acted on.
   */
  user_count: number;
  /** ISO 8601, formatted for display at the edge. */
  created_at: string;
}

/**
 * The writable fields of a dealership. Create and update take the same set,
 * so the form is written once and used twice.
 *
 * What is NOT here is as deliberate: `status` changes through close/reopen and
 * `user_count` is a fact, not a setting. A payload that could carry them would
 * make "correct a typo in the address" and "shut the branch" the same request.
 */
export interface DealerDetails {
  name: string;
  /** Empty string is sent as null: the field is optional. */
  code: string | null;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  postal_code: string;
}

export type NewDealer = DealerDetails;

/* ------------------------------------------------------------------------ *
 * THREE OF THE FOUR NOW READ DJANGO. `fetchDealers`, `createDealer` and
 * `updateDealer` are live; `setDealerStatus` is NOT, and that is C52 rather
 * than work left half done.
 *
 * Closing a dealership has no endpoint because **Q21 has never said what
 * closing one DOES** — to its people, to its records, or whether reopening is
 * symmetrical. The backend deliberately refuses to make `status` writable
 * until it does, so that shipping the obvious flag does not answer Q21 by
 * accident. Until then the button goes on moving a value in module memory,
 * and the organisation's real dealerships are unaffected by it.
 *
 * The fake data below therefore survives for `setDealerStatus` alone. Deleting
 * it is a one-line change the moment Q21 is answered and the two endpoints
 * exist.
 * ------------------------------------------------------------------------ */
const USE_FAKE_DEALER_STATUS = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let fakeDealers: Dealer[] = [
  {
    id: "unit-1",
    name: "Chennai — Guindy",
    code: "CHN-GUI",
    contact_person: "Anita Fernandes",
    email: "guindy@acmemotors.in",
    phone: "+91 44 2345 6789",
    city: "Chennai",
    state: "Tamil Nadu",
    postal_code: "600032",
    status: "active",
    user_count: 2,
    created_at: "2024-03-12T09:00:00Z",
  },
  {
    id: "unit-2",
    name: "Bangalore — Whitefield",
    code: "BLR-WHF",
    contact_person: "Vikram Nair",
    email: "whitefield@acmemotors.in",
    phone: "+91 80 4123 7788",
    city: "Bengaluru",
    state: "Karnataka",
    postal_code: "560066",
    status: "active",
    user_count: 1,
    created_at: "2024-07-01T09:00:00Z",
  },
  {
    // A branch under Chennai, so the tree is visible in the fake rather than
    // only in the type.
    id: "unit-3",
    name: "Coimbatore — Peelamedu",
    code: "CBE-PLM",
    contact_person: "Meera Krishnan",
    email: "peelamedu@acmemotors.in",
    phone: "+91 422 665 4321",
    city: "Coimbatore",
    state: "Tamil Nadu",
    postal_code: "641004",
    status: "active",
    user_count: 1,
    created_at: "2025-01-20T09:00:00Z",
  },
  {
    id: "unit-4",
    name: "Madurai — Ring Road",
    code: null,
    contact_person: "Sanjay Desai",
    email: "madurai@acmemotors.in",
    phone: "+91 452 234 9900",
    city: "Madurai",
    state: "Tamil Nadu",
    postal_code: "625010",
    status: "disabled",
    user_count: 0,
    created_at: "2023-11-05T09:00:00Z",
  },
];

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

export async function fetchDealers(orgSlug: string): Promise<Dealer[]> {
  return request<Dealer[]>(`/api/v1/orgs/${orgSlug}/admin/dealers/`);
}

export async function createDealer(orgSlug: string, body: NewDealer): Promise<Dealer> {
  return request<Dealer>(`/api/v1/orgs/${orgSlug}/admin/dealers/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * FAKE BACKEND ONLY: resolve a dealership's display name from its id.
 *
 * The real server does this with a join, which is why `unit_name` arrives on a
 * user at all — an id is not a label. The users fake used to carry its own
 * hardcoded map of the four seeded dealerships, so anybody scoped to a
 * dealership CREATED IN THIS SESSION came back with `unit_name: null` and the
 * detail panel said "Organisation — not limited to any one dealer". The id was
 * stored correctly the whole time; only the label was missing, which makes it
 * look exactly like a scoping bug and is a genuinely expensive afternoon.
 *
 * Goes when the backend lands, with the rest of the fakes.
 */
export function fakeDealerName(unitId: string | null | undefined): string | null {
  if (!unitId) return null;
  return fakeDealers.find((dealer) => dealer.id === unitId)?.name ?? null;
}

export async function updateDealer(
  orgSlug: string,
  dealerId: string,
  body: DealerDetails,
): Promise<Dealer> {
  return request<Dealer>(`/api/v1/orgs/${orgSlug}/admin/dealers/${dealerId}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function setDealerStatus(
  orgSlug: string,
  dealerId: string,
  status: DealerStatus,
): Promise<Dealer> {
  if (USE_FAKE_DEALER_STATUS) {
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
    `/api/v1/orgs/${orgSlug}/admin/dealers/${dealerId}/${status === "active" ? "reopen" : "close"}/`,
    { method: "POST" },
  );
}
