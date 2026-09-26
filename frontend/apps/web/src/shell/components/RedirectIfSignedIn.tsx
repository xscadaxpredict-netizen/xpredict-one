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
 */

import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useMe } from "../hooks/useAuth";

export function RedirectIfSignedIn({ children }: { children: ReactElement }) {
  const { data: me, isPending } = useMe();

  /*
   * Render the form while the answer is outstanding rather than showing a
   * spinner. For everybody who is genuinely signed out — the overwhelming
   * majority of visits to this screen — a spinner would delay the form by a
   * round trip to show it in the end anyway.
   */
  if (isPending) return children;

  const first = me?.memberships[0];
  if (first) return <Navigate to={`/${first.org_slug}`} replace />;

  return children;
}
