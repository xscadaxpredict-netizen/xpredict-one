/**
 * What the signed-in person may open, and what they may do.
 *
 * ONE PLACE, for the same reason `visibleApps()` is one place: this is checked
 * by the sidebar, by the route guard and by individual buttons, and a rule
 * written out three times becomes three rules the moment somebody edits one.
 *
 * READ THIS BEFORE USING IT
 *
 * None of this is security, and it cannot be. The token is in an httpOnly
 * cookie the page cannot read (C12), but everything here runs in the browser,
 * where anyone can change it. Hiding a button does not stop the request behind
 * it; redirecting away from a route does not stop the fetch that route would
 * have made.
 *
 * Every one of these checks exists so the SCREEN MAKES SENSE — so people are
 * not shown doors that will not open. The real check is the identical one in
 * Django, and if the two ever disagree, Django is right and this is the bug.
 *
 * The practical danger is not an attacker. It is a developer seeing
 * `can("dms.enquiry.create")` in a component, concluding the case is handled,
 * and not writing the check in the service function.
 */

import { useMemo } from "react";

import type { AppAccess, Membership } from "./api/auth";
import { useShellContext } from "./context";

export interface Access {
  /**
   * May this person open this module of the current app?
   *
   * Module keys are URL segments the frontend already names — "sales",
   * "service" — so checking one here is not inventing vocabulary.
   */
  hasModule: (moduleKey: string) => boolean;

  /**
   * May this person take this action?
   *
   * The string is the backend's, not ours. Pass it through; never build one by
   * concatenation, or a renamed permission fails silently as a permanent `false`
   * rather than as an error anybody notices.
   */
  can: (permission: string) => boolean;

  /** Everything granted, for debugging and for tests. Never iterate this to build UI. */
  modules: readonly string[];
  permissions: readonly string[];
}

/**
 * Nothing granted.
 *
 * FAILS CLOSED, and that direction matters. The alternative — treating "no
 * answer yet" as "allowed" — flashes buttons the person cannot use during
 * every load, and the one time the app is genuinely wrong about the answer it
 * is wrong in the generous direction.
 */
const NO_ACCESS: Access = {
  hasModule: () => false,
  can: () => false,
  modules: [],
  permissions: [],
};

/**
 * Build the access rules for one app within one organisation.
 *
 * Plain function, no React: the same logic is needed in tests and would be
 * needed by a route loader, neither of which can call a hook.
 */
export function accessFor(membership: Membership, appKey: string | undefined): Access {
  if (appKey === undefined) return NO_ACCESS;

  const app: AppAccess | undefined = membership.apps.find((entry) => entry.key === appKey);

  // Unsubscribed or inaccessible apps grant nothing, so an app the person
  // should never have reached cannot hand out permissions on the way past.
  if (!app || !app.subscribed || !app.accessible) return NO_ACCESS;

  const modules = new Set(app.modules);
  const permissions = new Set(app.permissions);

  return {
    hasModule: (moduleKey) => modules.has(moduleKey),
    can: (permission) => permissions.has(permission),
    modules: app.modules,
    permissions: app.permissions,
  };
}

/**
 * The access rules for the app currently open.
 *
 * Takes no arguments on purpose. The app is already in the shell context, so
 * there is no way for a caller to pass the wrong one — which is the mistake
 * that would produce a screen checking DMS permissions inside Administration.
 *
 * Returns "nothing granted" on the launcher, where no app is open.
 */
export function useAccess(): Access {
  const { membership, app } = useShellContext();

  // The Sets inside `accessFor` are rebuilt whenever this runs, and `can()` is
  // called once per button on a busy screen.
  return useMemo(() => accessFor(membership, app?.key), [membership, app?.key]);
}
