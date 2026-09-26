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
      {
        /*
         * A dealer admin manages their OWN dealer's people here, not in the
         * organisation's Administration app (C17). Two-level administration
         * (C3) means these are genuinely different jobs with different scopes,
         * and putting a dealer admin into the org console to do the smaller one
         * would hand them a screen listing every dealer's users.
         */
        label: "This dealer",
        items: [
          { label: "Dealer settings", path: "settings", icon: "sliders", module: "settings" },
        ],
      },
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
          { label: "People", path: "people", icon: "users", module: "people" },
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
