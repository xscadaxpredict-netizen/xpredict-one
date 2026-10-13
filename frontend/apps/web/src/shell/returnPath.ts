/**
 * Where to send somebody after they sign in.
 *
 * Two questions, both of which were answered inside `RedirectIfSignedIn` until
 * the sign-in screen needed the second one too:
 *
 *   - Is this return path safe to navigate to at all?
 *   - Does it work for somebody who belongs to no organisation?
 *
 * ZERO MEMBERSHIPS USED TO MEAN ONE THING. Before invitations could be
 * accepted it meant "you were removed", and the guard was right that there was
 * nowhere to send such a person: every route worth having needs a membership,
 * and `/` sends them back to `/login`, which bounces forever.
 *
 * Accepting an invitation (C56) gave it a second meaning — INVITED, NOT YET
 * JOINED — and that person has somewhere to be after signing in: the
 * invitation they came from. Someone removed from their only organisation and
 * re-invited is exactly this case, and they were being told their access had
 * been removed while an invitation sat waiting, with the link they had arrived
 * from discarded.
 */

/**
 * The validated return path from router state, or null.
 *
 * ONLY EVER AN IN-APP PATH. `state` is reachable from the address bar — anyone
 * can push history state — so a value from it is untrusted input. Accepting an
 * absolute URL would turn the sign-in screen into an open redirect: a link
 * that signs someone in and lands them on a copy of this app that keeps
 * whatever they type next.
 *
 * "//evil.example" is the case that catches people out: it has no scheme, so a
 * naive "must start with /" check passes it and the browser reads it as a
 * protocol-relative URL to another host.
 */
export function returnPath(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;

  if (typeof from !== "string") return null;
  if (!from.startsWith("/") || from.startsWith("//")) return null;

  return from;
}

/**
 * Can somebody who belongs to no organisation be sent here?
 *
 * ONLY THE INVITATION ROUTE, and the narrowness is the point rather than a
 * stub. `/invite/:token` is the single screen in the app that works without a
 * membership — it is for people who do not have one yet. Everything under
 * `/:orgSlug` goes through `AppShell`, which answers zero memberships with
 * `NoAccessScreen`, so honouring an arbitrary return path here would swap one
 * dead end for another rather than fixing anything.
 *
 * Adding a route to this list means that route renders something useful to a
 * person with no organisation. There is no second one today.
 */
export function worksWithoutMembership(path: string): boolean {
  return path === "/invite" || path.startsWith("/invite/");
}
