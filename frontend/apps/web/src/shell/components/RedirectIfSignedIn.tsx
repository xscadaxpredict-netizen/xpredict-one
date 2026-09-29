/**
 * Keeps signed-in people off the sign-in and sign-up screens.
 *
 * Without this, someone already signed in who opens a bookmarked `/login` is
 * shown a login form — which reads as "you have been signed out" and invites
 * them to type a password they did not need to type.
 *
 * TWO CONDITIONS, not one. Redirecting whenever `/me` succeeds would trap
 * anyone with zero memberships: there is nowhere to send them, `/` sends them
 * back to `/login`, and the two bounce forever. Someone with no organisation
 * stays on the form, where the sign-in flow already has a message for them.
 *
 * IT IS ALSO THE ONLY THING THAT DECIDES WHERE YOU LAND. The login screen used
 * to navigate as well, and the two raced: this one sent people to their
 * organisation root while that one sent them to the page they had been blocked
 * from, and whichever resolved last won. Deep links survived by luck.
 */

import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useMe } from "../hooks/useAuth";

export function RedirectIfSignedIn({ children }: { children: ReactElement }) {
  const { data: me, isPending } = useMe();
  const location = useLocation();

  /*
   * Render the form while the answer is outstanding rather than showing a
   * spinner. For everybody who is genuinely signed out — the overwhelming
   * majority of visits to this screen — a spinner would delay the form by a
   * round trip to show it in the end anyway.
   */
  if (isPending) return children;

  const first = me?.memberships[0];

  /*
   * No organisation picker (C13): the first membership. And the launcher
   * rather than an app (C15), because which apps exist is the server's answer.
   */
  if (first) return <Navigate to={returnTo(location.state, `/${first.org_slug}`)} replace />;

  return children;
}

/**
 * Where to go after signing in.
 *
 * Only ever an in-app path. `state` is reachable from the address bar — anyone
 * can push history state — so a value from it is untrusted input. Accepting an
 * absolute URL here would turn the login screen into an open redirect: a link
 * that signs someone in and lands them on a copy of this app that keeps what
 * they type next.
 *
 * "//evil.example" is the case that catches people out: it has no scheme, so a
 * naive "must start with /" check passes it, and the browser reads it as a
 * protocol-relative URL to another host.
 */
function returnTo(state: unknown, fallback: string): string {
  const from = (state as { from?: unknown } | null)?.from;

  if (typeof from !== "string") return fallback;
  if (!from.startsWith("/") || from.startsWith("//")) return fallback;

  return from;
}
