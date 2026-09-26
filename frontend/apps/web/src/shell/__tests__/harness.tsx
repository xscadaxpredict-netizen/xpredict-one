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
import { RedirectIfSignedIn } from "../components/RedirectIfSignedIn";
import { LauncherScreen } from "../screens/LauncherScreen";
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

export function renderRoute({ path, children = [] }: RenderRouteOptions): RenderResult {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Navigate to="/login" replace /> },
      {
        path: "/login",
        element: (
          <RedirectIfSignedIn>
            <h1>Sign in</h1>
          </RedirectIfSignedIn>
        ),
      },
      {
        path: "/:orgSlug",
        element: <AppShell />,
        children: [
          { index: true, element: <LauncherScreen /> },
          ...children,
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
    { initialEntries: [path] },
  );

  return render(
    <QueryClientProvider client={testQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
