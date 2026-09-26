/**
 * The frame every signed-in page sits inside — and the gate that decides
 * whether there is a signed-in page at all.
 *
 * WHY THE GUARD LIVES HERE rather than in a separate `RequireAuth` wrapper:
 * the frame cannot draw itself without knowing who you are. It needs your name
 * for the avatar and your memberships for the organisation switcher. Since it
 * has to ask `/me` anyway, the answer to "are you signed in?" arrives for free —
 * a separate guard component would ask the same question a second time.
 *
 * FOUR OUTCOMES, and each one is a real state a real user reaches:
 *
 *   1. still asking      -> a quiet full-page wait
 *   2. `/me` says 401    -> not signed in; go to /login
 *   3. zero memberships  -> authenticated with nowhere to go (C13)
 *   4. not in this org   -> the URL names someone else's organisation
 *
 * Only after all four does the frame render. Rendering the topbar first and
 * filling it in later means the launcher and avatar flash empty on every load.
 *
 * There is no token check anywhere in here, and there cannot be (C12): the
 * cookie is httpOnly, so JavaScript cannot see it. "Am I signed in?" is not a
 * value we hold — it is whether the server answers `/me`. Which makes this a
 * loading state, not an `if`.
 *
 * AND IT IS NOT SECURITY. Everything here is about showing the right screen.
 * A determined visitor can edit the URL, and the backend is what stops them.
 */

import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";

import { ShellProvider, type ShellContext } from "./context";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { useMe } from "./hooks/useAuth";
import { findApp, visibleApps } from "./navigation";
import { NoAccessScreen } from "./screens/NoAccessScreen";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const location = useLocation();
  const { data: me, isPending, isError } = useMe();

  /*
   * Which app is open, read from the URL: `/:orgSlug/<appKey>/...`.
   *
   * Index 0 is the empty string before the leading slash, 1 is the org slug, so
   * the app key is 2. Deliberately not a `useState` — the URL already holds this
   * and two copies of one fact eventually disagree.
   */
  const appKey = location.pathname.split("/")[2];
  const app = findApp(appKey);

  if (isPending) {
    return (
      <div className={styles.waiting} role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  /*
   * `isError` here means the `/me` request failed, and for an unauthenticated
   * visitor that failure is a 401 — a normal answer, not a fault. `useMe` sets
   * `retry: false` for exactly this reason; retrying "you are not signed in"
   * three times just delays the login screen.
   *
   * `state` carries where they were trying to go. The login screen does not use
   * it yet, so someone deep-linked to a page still lands on the DMS home after
   * signing in rather than the page they wanted. Worth wiring up; noted rather
   * than half-built.
   */
  if (isError || !me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (me.memberships.length === 0) {
    return <NoAccessScreen variant="removed" />;
  }

  const membership = me.memberships.find((m) => m.org_slug === orgSlug);

  if (!orgSlug || !membership) {
    /*
     * Offer their own organisation rather than bouncing them there silently: an
     * automatic redirect from a bookmarked URL looks like the bookmark worked
     * and the app is showing the wrong data.
     */
    return (
      <NoAccessScreen variant="unknown" fallbackOrgSlug={me.memberships[0]?.org_slug} />
    );
  }

  /*
   * An app in the URL that this person may not open — a stale link, a
   * colleague's bookmark, or an app the organisation stopped paying for. Send
   * them to the launcher rather than rendering an empty frame around nothing.
   *
   * `replace` so Back does not bounce them straight into it again.
   *
   * COURTESY, NOT SECURITY. Every request the app would have made is rejected
   * by the backend on its own. This exists so the screen makes sense.
   */
  const appIsOpenable =
    app === undefined || visibleApps(membership).some((a) => a.definition.key === app.key && a.enabled);

  if (!appIsOpenable) {
    return <Navigate to={`/${orgSlug}`} replace />;
  }

  const shellContext: ShellContext = { me, membership, app };

  return (
    <ShellProvider value={shellContext}>
      <div className={styles.shell}>
        <Topbar me={me} membership={membership} app={app} />

        <div className={styles.body}>
          {app && <Sidebar app={app} orgSlug={orgSlug} />}

          {/*
            The page. `main` is a landmark screen readers can jump straight to,
            which matters more here than anywhere else: the topbar and sidebar
            repeat on every single screen.
          */}
          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
      </div>
    </ShellProvider>
  );
}
