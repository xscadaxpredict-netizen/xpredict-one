/**
 * Joining an organisation somebody invited you to (C56).
 *
 * THERE IS NO EMAIL. An admin copies the link and sends it however they
 * already talk to the person, so these two calls are the whole of the receiving
 * end: read what the link is for, then redeem it.
 *
 * NOT UNDER `/orgs/<slug>/`. Every endpoint there verifies an active membership
 * before the handler runs (C49), and the person using these has none yet — the
 * token is what names the organisation. It also keeps the customer's slug out
 * of a URL that gets pasted into chat messages.
 *
 * NO FAKE IN THIS FILE. Every other `api/*.ts` was written against a fake first
 * because the backend did not exist; this one was written after it did, so
 * there is nothing to delete later.
 */

import { request } from "@xpredict/api-client";

/**
 * What the accept screen may know before anybody signs in.
 *
 * DELIBERATELY THIN. The endpoint is unauthenticated, so every field here is a
 * disclosure to whoever is holding the link — the dealership, the role and the
 * apps are all absent, because none of them help the holder decide and all of
 * them are somebody's staffing arrangement.
 *
 * This shape IS the contract with `InvitationPreviewSerializer`: C43 removed
 * the generated client, so nothing checks that the two agree.
 */
export interface InvitationPreview {
  organization_name: string;
  organization_slug: string;
  /** The address invited. Shown so the holder can tell a forwarded link. */
  email: string;
  expires_at: string;
  is_expired: boolean;
  is_accepted: boolean;
  /**
   * True when this address already has an account, so the screen asks them to
   * sign in instead of offering a password field. One login spans
   * organisations (C1), so this is ordinary rather than exceptional.
   */
  requires_sign_in: boolean;
  /** Who invited them, as a name or an address. May be empty. */
  invited_by: string;
}

export interface AcceptResult {
  org_slug: string;
  /** False when they already had an account and signed in to accept. */
  account_created: boolean;
}

/**
 * What is this link for?
 *
 * IT SUCCEEDS FOR AN EXPIRED OR SPENT INVITATION. "Ask for a new link" and
 * "you have already accepted" are different sentences and both are more use
 * than a dead page, so the states arrive as fields rather than as errors. Only
 * an unknown token is a 404.
 */
export async function fetchInvitation(token: string): Promise<InvitationPreview> {
  return request<InvitationPreview>(`/api/v1/invitations/${encodeURIComponent(token)}/`, {
    // Reached by somebody with no session at all, which is the whole point of
    // it (C56). There is nothing to refresh.
    public: true,
  });
}

/**
 * Redeem the link.
 *
 * ACCEPTING SIGNS THEM IN, through the same httpOnly cookies as login (C12),
 * so there is nothing to store here — the caller refetches `/me` and the shell
 * takes over.
 *
 * `password` is omitted by somebody who already had an account and signed in to
 * accept; the server decides which case it is holding, because it is the only
 * side that knows whether the address has an account.
 */
export async function acceptInvitation(
  token: string,
  body: { password?: string },
): Promise<AcceptResult> {
  return request<AcceptResult>(`/api/v1/invitations/${encodeURIComponent(token)}/accept/`, {
    method: "POST",
    body: JSON.stringify(body),
    public: true,
  });
}
