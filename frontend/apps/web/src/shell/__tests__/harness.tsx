/**
 * Renders real routes against a stubbed `/me`.
 *
 * These tests go through the router rather than rendering a screen directly,
 * because the thing being tested IS the routing: which element a URL resolves
 * to, and whether a guard redirected first. Rendering `<AppShell />` on its own
 * would test a component while the bug being guarded against lives in the route
 * table.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppShell } from "../AppShell";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { RedirectIfSignedIn } from "../components/RedirectIfSignedIn";
import { LauncherScreen } from "../screens/LauncherScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { NotFoundScreen } from "../screens/NotFoundScreen";

/**
 * A fresh client per test.
 *
 * Sharing one would let a test that signed somebody in leak that cached
 * identity into the next test — the same class of bug the org-scoped cache
 * keys exist to prevent, but between tests instead of between customers.
 */
function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // A stubbed 401 is an answer, not a flake. Retrying it makes every
      // signed-out test wait for three attempts before asserting.
      queries: { retry: false, staleTime: Infinity },
    },
  });
}

interface RenderRouteOptions {
  /** Where to start. */
  path: string;
  /** Extra child routes under `/:orgSlug`, for testing a product's screens. */
  children?: Parameters<typeof createMemoryRouter>[0];
}

/**
 * Returns the router alongside the render result, so a test can read the
 * location the app actually navigated to.
 *
 * `window.location` is NOT touched by `createMemoryRouter`, so a test asserting
 * against it is asserting against an empty string and passes whatever the code
 * does — which is worth being able to avoid.
 */
export function renderRoute({
  path,
  children = [],
}: RenderRouteOptions): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Navigate to="/login" replace /> },
      {
        /*
         * The real screen, not a stand-in. These tests are about what happens
         * between the form, the login hook and the guard — a placeholder
         * heading would prove none of it.
         */
        path: "/login",
        element: (
          <RedirectIfSignedIn>
            <LoginScreen />
          </RedirectIfSignedIn>
        ),
      },
      {
        path: "/:orgSlug",
        element: <AppShell />,
        children: [
          { index: true, element: <LauncherScreen /> },
          { path: "admin/users", element: <UsersScreen /> },
          ...children,
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
    { initialEntries: [path] },
  );

  const result = render(
    <QueryClientProvider client={testQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...result, router };
}
