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

import type { AppAccess, AppModule, Membership } from "./api/auth";
import { useShellContext } from "./context";

export interface Access {
  /**
   * May this person open this module of the current app?
   *
   * Module keys are URL segments the frontend already names — "sales",
   * "service" — so checking one here is not inventing vocabulary. A TOP-LEVEL
   * module only: for a sub-module or a tab, ask `canSee`.
   */
  hasModule: (moduleKey: string) => boolean;

  /**
   * May this person SEE this section of the current app — a module, a
   * sub-module or a tab, anywhere in the tree `/me` sent (C79)?
   *
   * The server already left out everything they may not see: a tab is there
   * if they hold its `view`, and everything above it comes with it. So this is
   * "is the code in the tree", at any level.
   */
  canSee: (sectionCode: string) => boolean;

  /**
   * May this person take this action?
   *
   * The string is the backend's, not ours. Pass it through; never build one by
   * concatenation, or a renamed permission fails silently as a permanent `false`
   * rather than as an error anybody notices.
   */
  can: (permission: string) => boolean;

  /** Everything granted, for debugging and for tests. Never iterate this to build UI. */
  modules: readonly AppModule[];
  permissions: readonly string[];
}

/**
 * WHAT A SCREEN NEEDS before it is shown — a route, or a link in the sidebar.
 * Exactly ONE of three, and always written down: a screen declared with none
 * is a TypeScript error, so a forgotten guard is caught at compile time.
 *
 *   `section`     an app on the section tree (the Admin panel, C79): the
 *                 sub-module or tab the screen IS. Preferred.
 *   `permission`  a screen not on the tree yet — the Admin panel's Dealers
 *                 (Q64) — guarded by the permission its endpoint checks.
 *   `module`      DMS, until it moves onto the tree: its module word, or
 *                 `null` for a screen anyone inside the app may open.
 */
export type Gate =
  | { section: string; permission?: never; module?: never }
  | { permission: string; section?: never; module?: never }
  | { module: string | null; section?: never; permission?: never };

/** Whether `access` lets somebody through `gate`. The ONE reading of a gate. */
export function allows(access: Access, gate: Gate): boolean {
  if (gate.section !== undefined) return access.canSee(gate.section);
  if (gate.permission !== undefined) return access.can(gate.permission);
  return gate.module === null || access.hasModule(gate.module);
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
  canSee: () => false,
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

  const modules = new Set(app.modules.map((module) => module.code));
  // Every code in the tree, at every level: modules, sub-modules and tabs.
  const visible = new Set(
    app.modules.flatMap((module) => [
      module.code,
      ...module.sub_modules.flatMap((sub) => [sub.code, ...sub.tabs]),
    ]),
  );
  const permissions = new Set(app.permissions);

  const isDealerAdmin = membership.apps.some((a) =>
    a.permissions.includes("admin.user.create")
  );

  const isOrgAdmin =
    !membership.unit_id && (
      membership.role === "owner" ||
      membership.role === "admin" ||
      permissions.has("dms.manual.manage")
    );

  const isDealerManager =
    Boolean(membership.unit_id) &&
    (permissions.has("dms.order.confirm") || permissions.has("dms.enquiry.close"));

  const canAccessSettings = isOrgAdmin || isDealerManager;

  const isManagerOrAdmin =
    isOrgAdmin ||
    membership.role === "owner" ||
    membership.role === "admin" ||
    permissions.has("dms.enquiry.close") ||
    permissions.has("admin.user.create") ||
    isDealerAdmin;

  return {
    hasModule: (moduleKey) => {
      if (moduleKey === "settings") {
        return canAccessSettings;
      }
      return (
        modules.has(moduleKey) ||
        (isManagerOrAdmin && (moduleKey === "ecommerce" || moduleKey === "tools"))
      );
    },
    canSee: (sectionCode) => visible.has(sectionCode),
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
