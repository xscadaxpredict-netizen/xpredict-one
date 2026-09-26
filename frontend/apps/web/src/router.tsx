import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "./shell/AppShell";
import { DEFAULT_APP_KEY } from "./shell/navigation";
import { LoginScreen } from "./shell/screens/LoginScreen";
import { SignupScreen } from "./shell/screens/SignupScreen";

// Products are lazy-loaded: a user with only DMS access never downloads CRM.
// Each product exposes exactly one entry point, `routes.tsx` --- the shell is
// not allowed to reach past it (enforced by eslint.config.js).
const DmsRoutes = lazy(() => import("./products/dms/routes"));
const CrmRoutes = lazy(() => import("./products/crm/routes"));

function Loading() {
  return <div role="status">Loading…</div>;
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace />,},
  { path: "/login", element: <LoginScreen />, },
  { path: "/signup", element: <SignupScreen />, },
  {
    path: "/:orgSlug",
    element: <AppShell />,
    children: [
      /*
       * `/acme-motors` on its own names an organisation but no app, which
       * happens with a bookmark or a typed address. Without this it renders the
       * shell around an empty page.
       *
       * Relative `to`, so it resolves against the parent `/:orgSlug` rather than
       * the site root. `replace` keeps the bare URL out of the history, or Back
       * lands on it and redirects forward again.
       */
      { index: true, element: <Navigate to={DEFAULT_APP_KEY} replace /> },
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
    ],
  },
]);
