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
 * WITH ONE EXCEPTION, ADDED 2026-10-08: an invitation. Zero memberships used
 * to mean "you were removed" and now also means "invited, not yet joined"
 * (C56), and that person DOES have somewhere to be — the link they arrived
 * from. Somebody removed from their only organisation and then re-invited hit
 * this exactly: signing in worked, the invitation was waiting, and the screen
 * told them their access had been removed while discarding the link.
 *
 * The exception is narrow on purpose. `/invite/:token` is the only route that
 * renders anything useful without a membership; honouring an arbitrary return
 * path would send them into `AppShell` and its "no access" screen instead,
 * which is a different dead end rather than a fix.
 *
 * IT IS ALSO THE ONLY THING THAT DECIDES WHERE YOU LAND. The login screen used
 * to navigate as well, and the two raced: this one sent people to their
 * organisation root while that one sent them to the page they had been blocked
 * from, and whichever resolved last won. Deep links survived by luck.
 */

import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useMe } from "../hooks/useAuth";
import { returnPath, worksWithoutMembership } from "../returnPath";

export function RedirectIfSignedIn({ children }: { children: ReactElement }) {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  const from = returnPath(location.state);

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
  if (first) return <Navigate to={from ?? `/${first.org_slug}`} replace />;

  /*
   * Signed in, belongs to nothing, and came from somewhere that does not need
   * a membership — an invitation. Checked AFTER `first` so this changes
   * nothing for anybody who has an organisation.
   */
  if (me && from && worksWithoutMembership(from)) {
    return <Navigate to={from} replace />;
  }

  return children;
}

