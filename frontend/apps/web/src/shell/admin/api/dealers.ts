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

import { request } from "@xpredict/api-client";

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

  /**
   * GSTIN: the dealership's GST registration number. MANDATORY on every write.
   *
   * Fifteen characters, and the last one is a check digit — so a typo is
   * caught rather than stored, by `gstin.ts` here and by the serializer at the
   * other end. Empty only on a dealership created before the field existed:
   * the column is NOT NULL with an empty default, so those rows read as "".
   */
  gstin: string;

  /**
   * PAN: characters 3 to 12 of the GSTIN *are* the PAN, so this is derived and
   * then editable — a GSTIN issued against a predecessor entity's PAN is a
   * real situation, and the derivation is a convenience rather than a law.
   *
   * The backend fills it in when a write leaves it out, so this is never blank
   * for a dealership saved with a GSTIN.
   */
  pan: string;

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
  /** Mandatory, validated including its check digit at both ends. */
  gstin: string;
  /**
   * Sent as the person left it. Blank means "use the one in the GSTIN" and the
   * backend derives it — which is also how an overridden PAN gets back to its
   * default, by being cleared.
   */
  pan: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  postal_code: string;
}

export type NewDealer = DealerDetails;

export async function fetchDealers(orgSlug: string): Promise<Dealer[]> {
  return request<Dealer[]>(`/api/v1/orgs/${orgSlug}/admin/dealers/`);
}

export async function createDealer(orgSlug: string, body: NewDealer): Promise<Dealer> {
  return request<Dealer>(`/api/v1/orgs/${orgSlug}/admin/dealers/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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

/**
 * Close a dealership, or open it again (C63, answering Q21).
 *
 * THE LAST FAKE IN THE PRODUCT WAS HERE, and it is gone. From session 5 until
 * now these two buttons moved a value in module memory and no real dealership
 * was affected — deliberately, because C52 would not let the obvious status
 * flag ship and answer Q21 by accident. Q21 is answered, so the endpoints
 * exist and this calls them.
 *
 * WHAT CLOSING DOES, since the button says none of it: its people lose access
 * to everything, its records persist and stay readable to organisation-level
 * people, and reopening restores exactly what was there — nothing is written
 * to its memberships, so there is nothing to put back. There is no delete.
 */
export async function setDealerStatus(
  orgSlug: string,
  dealerId: string,
  status: DealerStatus,
): Promise<Dealer> {
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
