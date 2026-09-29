/**
 * How a product declares its screens, and how they get guarded.
 *
 * WHY ROUTES ARE DATA HERE AND NOT JSX
 *
 * The obvious way to guard a route is to wrap it:
 *
 *   <Route path="sales" element={<RequireModule module="sales"><Sales/></RequireModule>} />
 *
 * That works, and it is forgettable. Three developers adding screens under
 * deadline will eventually ship one without the wrapper, it will behave
 * perfectly for everyone who has access, and nobody will notice until somebody
 * who should not have access opens it.
 *
 * So a screen is declared as data with a REQUIRED `module` field, and this file
 * is the only thing that turns that data into routes. Leaving the field out is
 * a TypeScript error; `module: null` is allowed but has to be written down, so
 * it appears in review as a decision rather than an oversight.
 *
 * STILL NOT SECURITY. This decides which screen renders. The fetch behind the
 * screen is what matters and only Django can refuse it.
 */

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAccess } from "./access";
import { useShellContext } from "./context";
import { NotFoundScreen } from "./screens/NotFoundScreen";

export interface ModuleRoute {
  /** Relative to the app root: `/:orgSlug/<app>/<path>`. */
  path: string;

  /**
   * The module key this screen belongs to, or `null` for a screen anyone
   * inside the app may open. Required — see the note above.
   */
  module: string | null;

  element: ReactElement;
}

interface ModuleRoutesProps {
  routes: ModuleRoute[];
}

/**
 * Render a product's routes, dropping the ones this person may not open.
 *
 * A screen they lack is NOT rendered-then-redirected; it is not registered as
 * a route at all, so it falls through to the not-found below. That is the
 * safer failure: a guard that renders first and redirects in an effect has
 * already mounted the component, and a component that fetches on mount has
 * already made the request.
 */
export function ModuleRoutes({ routes }: ModuleRoutesProps) {
  const access = useAccess();
  const { membership } = useShellContext();

  const permitted = routes.filter((route) => route.module === null || access.hasModule(route.module));

  /*
   * Where the bare app URL goes. The first module they actually have, not a
   * hardcoded "sales" — that would send a service-only user to a screen they
   * cannot open, which is the exact bug the launcher was built to avoid one
   * level up.
   */
  const first = permitted.find((route) => route.module !== null) ?? permitted[0];

  return (
    <Routes>
      <Route
        index
        element={
          first ? (
            <Navigate to={first.path} replace />
          ) : (
            /*
             * Reachable: the app is accessible but every module inside it is
             * not — a role with the app switched on and nothing granted within
             * it. Back to the launcher rather than an empty frame.
             */
            <Navigate to={`/${membership.org_slug}`} replace />
          )
        }
      />

      {permitted.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {/*
        Everything else inside this app, INCLUDING the screens filtered out
        above. A module somebody lacks is indistinguishable from one that does
        not exist — the same reasoning as answering 404 rather than 403 for
        another organisation's records.

        Not-found rather than a silent redirect, and the same screen as an
        unknown page elsewhere: if a missing module bounced somewhere while a
        typo showed an error, the difference in behaviour would itself tell you
        the module exists.
      */}
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
