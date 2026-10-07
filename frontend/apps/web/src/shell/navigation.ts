/**
 * What is in the suite, what each app's sidebar holds, and who may see what.
 *
 * TWO SOURCES, ON PURPOSE.
 *
 *   This file — copy and structure. Names, one-line descriptions, sidebar
 *   links. Facts that are the same for every customer.
 *
 *   `/api/v1/me` — entitlement. Which apps this organisation pays for and
 *   which ones this person may enter. Never decided here.
 *
 * Getting that split wrong in either direction hurts. Hardcoding entitlement
 * means shipping a release to change who can see Administration. Asking the
 * server for the word "Dealership management" means a copy fix becomes a
 * backend deploy.
 *
 * NOTHING HERE IS A CONTROL. Hiding a tile or a link is a courtesy; the
 * backend rejects the request regardless of what was drawn. The URL is always
 * typeable.
 */

import type { AppAccess, AppKey, Membership } from "./api/auth";
import type { NavIconName } from "./components/NavIcon";

export interface NavItem {
  /** Sidebar label. */
  label: string;
  /** Path relative to `/:orgSlug/<app key>/`. Empty string means the app root. */
  path: string;
  /**
   * The icon beside the label, and the only thing left once the rail is
   * collapsed to 64px.
   *
   * Required, like `module` below — a new screen has to choose one, and a
   * missing icon is a compile error rather than a blank square nobody spots.
   * Icons are named by what they draw, so picking one is not a claim that no
   * other module may use it.
   */
  icon: NavIconName;

  /**
   * The module key this link needs, or `null` for a link anyone inside the app
   * may follow.
   *
   * REQUIRED, not optional, and that is the point. An optional field is one a
   * developer adding a screen at 5pm does not notice; a required one is a
   * compile error. `null` is allowed but has to be typed deliberately, so it
   * shows up in a diff as a decision rather than an omission.
   *
   * Same reasoning as listing the ESLint exemptions file by file instead of
   * matching them with a pattern.
   */
  module: string | null;
}

/**
 * A heading in the sidebar with its screens underneath.
 *
 * DMS is two levels because a module is not a screen: Sales is a module that
 * owns Enquiries, Quotations, Confirmed orders and Follow-ups. Flattening them
 * into one list was the confusion behind Q19 — the two competing module lists
 * were never competing, they were different levels of the same tree.
 */
export interface NavGroup {
  /** Shown above the group. A single unnamed group renders without a heading. */
  label: string | null;
  items: NavItem[];
}

export interface AppDefinition {
  key: AppKey;
  name: string;
  /** One line under the name in the launcher. Copy, not data. */
  description: string;
  /** Two letters for the launcher tile. */
  initials: string;
  nav: NavGroup[];
}

/**
 * Every app the suite knows how to draw — including ones this organisation has
 * not bought. A tile cannot be shown disabled if the frontend has never heard
 * of the app, so E-commerce is listed here despite being deferred. Deferred
 * means nobody is building it, not that nobody may know it exists.
 */
export const APP_CATALOG: AppDefinition[] = [
  {
    key: "dms",
    name: "DMS",
    description: "Dealership management",
    initials: "DM",
    /*
     * Q19 answered 2026-09-26 from the owner's UI mock: Sales, Service and
     * Tech support are the MODULES; enquiries, quotations and the rest are
     * screens inside them. Org-level dealer management lives in Administration
     * (C3), which is why there is no Dealers entry here.
     *
     * Only the module roots exist as routes today. The screens under them are
     * listed so the three developers building those modules agree on the names
     * before they each invent their own.
     */
    nav: [
      /*
       * ONE unlabelled group, not three of one item each — three groups render
       * as three separate lists, which a screen reader announces as "list, 1
       * item" three times over.
       *
       * When the screens inside a module exist, this becomes one group per
       * module with a heading:
       *   { label: "Sales", items: [Enquiries, Quotations, Confirmed orders, Follow-ups] }
       *   { label: "Service", items: [Appointments, Job cards] }
       * A module the person's role excludes is dropped from this list by the
       * backend's answer, never hidden by a check written here.
       */
      {
        label: null,
        items: [
          { label: "Sales", path: "sales", icon: "tag", module: "sales" },
          { label: "Service", path: "service", icon: "wrench", module: "service" },
          {
            label: "Tech support",
            path: "tech-support",
            icon: "headset",
            module: "tech-support",
          },
        ],
      },
      /*
       * NO dealer-settings group, deliberately. A dealer admin manages their
       * own dealer's people in the Administration app, narrowed to their
       * dealership — C23, which superseded C21's separate area in here.
       * None of the six DMS roles carries such a module, so a group here would
       * render for nobody while telling everybody who reads this file the
       * opposite of how the product works.
       */
    ],
  },
  {
    key: "crm",
    name: "CRM",
    description: "Leads & marketing",
    initials: "CR",
    // Built after DMS ships. An empty sidebar is honest; invented links are not.
    nav: [],
  },
  {
    key: "ecommerce",
    name: "E-commerce",
    description: "Storefront & orders",
    initials: "EC",
    nav: [],
  },
  {
    key: "admin",
    name: "Administration",
    description: "Dealers, people, billing",
    initials: "AD",
    nav: [
      {
        label: "Organisation",
        items: [
          { label: "Users", path: "users", icon: "users", module: "users" },
          { label: "Dealers", path: "dealers", icon: "store", module: "dealers" },
          { label: "Roles", path: "roles", icon: "key", module: "roles" },
          { label: "Apps & billing", path: "billing", icon: "card", module: "billing" },
          { label: "Audit log", path: "audit", icon: "history", module: "audit" },
        ],
      },
    ],
  },
];

export function findApp(key: string | undefined): AppDefinition | undefined {
  return APP_CATALOG.find((app) => app.key === key);
}

/** An app as the launcher needs it: what to draw, plus whether it can be opened. */
export interface LauncherApp {
  definition: AppDefinition;
  access: AppAccess;
  /** False when the organisation has not subscribed: visible, but not enterable. */
  enabled: boolean;
}

/**
 * The apps to show this person, in catalog order.
 *
 * THE ONE PLACE THIS RULE LIVES. It is drawn in two places — the launcher page
 * and the topbar dropdown — and a rule copied into two components is a rule
 * that will disagree with itself after somebody edits one of them.
 *
 * IT ANSWERS "WHAT MAY I OPEN", AND NOTHING ELSE. For "what may I give
 * somebody", see `grantableApps()` below — the two look similar and are
 * opposite in the case that matters. Using this one for a grant form is what
 * made an organisation unable to hand out an app it was paying for.
 *
 *   org has not subscribed  -> SHOWN, DISABLED. Someone has to know an app
 *                              exists before they can ask to buy it.
 *   subscribed, no access   -> HIDDEN. That is a permission, and listing it
 *                              tells the person what they are not trusted with.
 *   subscribed and access   -> shown, enterable.
 *
 * An app key the server sends that this frontend has never heard of is skipped
 * rather than crashing the launcher, so the backend can ship a new app before
 * the frontend knows how to draw it.
 */
export function visibleApps(membership: Membership): LauncherApp[] {
  const result: LauncherApp[] = [];

  for (const definition of APP_CATALOG) {
    const access = membership.apps.find((app) => app.key === definition.key);
    if (!access) continue;

    if (access.subscribed && !access.accessible) continue;

    result.push({ definition, access, enabled: access.subscribed && access.accessible });
  }

  return result;
}

/**
 * The apps an administrator may GIVE somebody: everything this organisation
 * subscribes to.
 *
 * A DIFFERENT QUESTION FROM `visibleApps()`, and the bug that produced this
 * function is the reason to keep them apart. Both dialogs used to build their
 * app checkboxes from the launcher list, which hides an app you are subscribed
 * to but cannot open — correct for a launcher (C22: listing it tells you what
 * you are not trusted with) and a trap for a grant form.
 *
 * WHAT IT COST, found by the owner: they edited themselves, unticked DMS, and
 * DMS vanished from the form. Not only for their own record — for everybody's,
 * because the list was built from the EDITOR's access. An organisation paying
 * for DMS could no longer grant it to anyone, with no error and nothing to
 * click. C41 explicitly permits an owner to "drop what they never open"; it
 * never meant the door opens one way.
 *
 * AN ADMIN GRANTS ON BEHALF OF THE ORGANISATION, not out of their own pocket.
 * A finance admin who has never opened DMS still staffs dealerships with it.
 *
 * NOT SECURITY (C19). The backend refuses a grant for an app with no active
 * subscription — `AppNotSubscribedError`, the other half of C16 — and if the
 * two ever disagree the backend is right.
 */
export function grantableApps(membership: Membership): AppDefinition[] {
  return APP_CATALOG.filter((definition) => {
    // Administration is never granted: it comes with the platform and follows
    // from standing or from a role (C17, C40). It is not sold, so it would
    // fail the subscription test below anyway — excluded by name so the reason
    // is the real one.
    if (definition.key === "admin") return false;

    return membership.apps.find((app) => app.key === definition.key)?.subscribed ?? false;
  });
}
