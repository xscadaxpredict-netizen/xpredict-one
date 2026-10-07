import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "./shell/AppShell";
import { RedirectIfSignedIn } from "./shell/components/RedirectIfSignedIn";
import { LauncherScreen } from "./shell/screens/LauncherScreen";
import { NotFoundScreen } from "./shell/screens/NotFoundScreen";
import { InviteAcceptRoute } from "./shell/screens/InviteAcceptScreen";
import { LoginScreen } from "./shell/screens/LoginScreen";
import { SignupScreen } from "./shell/screens/SignupScreen";

// Products are lazy-loaded: a user with only DMS access never downloads CRM.
// Each product exposes exactly one entry point, `routes.tsx` --- the shell is
// not allowed to reach past it (enforced by eslint.config.js).
const DmsRoutes = lazy(() => import("./products/dms/routes"));
const CrmRoutes = lazy(() => import("./products/crm/routes"));
// Administration ships with the platform rather than being a product, so it
// lives in the shell — but it is still lazy: most people never open it.
const AdminRoutes = lazy(() => import("./shell/admin/routes"));

function Loading() {
  return <div role="status">Loading…</div>;
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace />,},
  {
    path: "/login",
    element: (
      <RedirectIfSignedIn>
        <LoginScreen />
      </RedirectIfSignedIn>
    ),
  },
  {
    path: "/signup",
    element: (
      <RedirectIfSignedIn>
        <SignupScreen />
      </RedirectIfSignedIn>
    ),
  },
  /*
   * Accepting an invitation (C56). The link is handed over by hand -- there is
   * no email -- so this is the first screen many people ever see.
   *
   * NOT WRAPPED IN `RedirectIfSignedIn`, and that is deliberate rather than an
   * omission. The guard sends anybody already signed in to their own launcher,
   * which is exactly what must not happen to somebody holding an invitation to
   * a SECOND organisation (C1): one login spans organisations, so a signed-in
   * person opening this link is the ordinary case and the screen handles it.
   *
   * No org slug either. The token names the organisation, which keeps a
   * customer's name out of a URL that gets pasted into chat messages.
   */
  { path: "/invite/:token", element: <InviteAcceptRoute /> },
  {
    path: "/:orgSlug",
    element: <AppShell />,
    children: [
      /*
       * `/acme-motors` is the app launcher, NOT a redirect into DMS.
       *
       * It used to redirect, which only works if everyone has DMS. Which apps
       * exist for you depends on what the organisation pays for and what your
       * role allows, so the app is a choice the server answers — and jumping
       * into one nobody can open means a correct password is rewarded with a
       * "no access" screen.
       */
      { index: true, element: <LauncherScreen /> },
      {
        path: "dms/*",
        element: (
          <Suspense fallback={<Loading />}>
            <DmsRoutes />
          </Suspense>
        ),
      },
      {
        path: "crm/*",
        element: (
          <Suspense fallback={<Loading />}>
            <CrmRoutes />
          </Suspense>
        ),
      },
      {
        path: "admin/*",
        element: (
          <Suspense fallback={<Loading />}>
            <AdminRoutes />
          </Suspense>
        ),
      },
      /*
       * Anything else under an organisation. Without this, React Router has no
       * match and renders its own developer error page — the one that says
       * "Unexpected Application Error!" and gives the visitor advice about
       * errorElement. Every typo and stale link landed there.
       *
       * Inside the shell on purpose, so a signed-out visitor still gets sent to
       * /login by the guard rather than being told a page is missing.
       */
      { path: "*", element: <NotFoundScreen /> },
    ],
  },
  /*
   * Anything else at all: an address with no organisation in it. Sent to the
   * root, which sends signed-out visitors to /login. Deliberately not the
   * not-found screen above — that one needs an organisation to talk about.
   */
  { path: "*", element: <Navigate to="/" replace /> },
]);
