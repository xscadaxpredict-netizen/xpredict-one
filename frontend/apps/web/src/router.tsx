import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "./shell/AppShell";
import { LoginScreen } from "./shell/screens/LoginScreen";

// Products are lazy-loaded: a user with only DMS access never downloads CRM.
// Each product exposes exactly one entry point, `routes.tsx` --- the shell is
// not allowed to reach past it (enforced by eslint.config.js).
const DmsRoutes = lazy(() => import("./products/dms/routes"));
const CrmRoutes = lazy(() => import("./products/crm/routes"));

function Loading() {
  return <div role="status">Loading…</div>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    // The ONE route outside organisation scope. There is no org yet — that is
    // the entire point of this screen — so nothing here can use useOrgSlug.
    path: "/login",
    element: <LoginScreen />,
  },
  {
    // The org slug lives in the URL, not in the token (C2), so switching
    // organizations is a navigation rather than a re-authentication.
    path: "/:orgSlug",
    element: <AppShell />,
    children: [
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
