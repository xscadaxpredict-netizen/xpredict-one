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
        label: "Sales",
        items: [
          { label: "Enquiries", path: "sales/enquiries", icon: "tag", module: "sales" },
          { label: "Confirmed orders", path: "sales/orders", icon: "card", module: "sales" },
          { label: "Quotations", path: "sales/quotations", icon: "history", module: "sales" },
        ],
      },
      {
        label: "Site Services",
        items: [
          { label: "AMC", path: "site-services", icon: "tag", module: "service" },
          { label: "Scheduled Services", path: "site-services/scheduling", icon: "history", module: "service" },
          { label: "Service Reports", path: "site-services/reports", icon: "card", module: "service" },
          { label: "Water Reports", path: "site-services/water", icon: "wrench", module: "service" },
          { label: "Complaint Box", path: "site-services/complaints", icon: "headset", module: "service" },
        ],
      },
      {
        label: "Installation & Tech Support",
        items: [
          { label: "User Manuals", path: "tech-support/manuals", icon: "headset", module: "tech-support" },
          { label: "Machine Videos", path: "tech-support/videos", icon: "headset", module: "tech-support" },
          { label: "Request for Call", path: "tech-support/calls", icon: "headset", module: "tech-support" },
          { label: "Timer Calculation", path: "tech-support/timer-calculation", icon: "wrench", module: "tech-support" },
        ],
      },
      {
        label: "E-Commerce",
        items: [
          { label: "Store Catalog", path: "ecommerce/catalog", icon: "store", module: "ecommerce" },
          { label: "My Orders", path: "ecommerce/orders", icon: "card", module: "ecommerce" },
        ],
      },
      {
        label: "Tools",
        items: [
          { label: "Marketing Kit", path: "tools/marketing", icon: "sliders", module: "tools" },
          { label: "Capacity Calculator", path: "tools/calculator", icon: "sliders", module: "tools" },
          { label: "Feasibility", path: "tools/feasibility", icon: "sliders", module: "tools" },
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
