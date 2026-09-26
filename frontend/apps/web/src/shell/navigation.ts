/**
 * What is in the suite, and what is in each app's sidebar.
 *
 * ONE FILE, ON PURPOSE. Navigation is the thing three developers will each
 * invent separately if it has no obvious home. It has one now.
 *
 * Why the shell owns this and not each product: the shell is forbidden from
 * importing a product's internals (see eslint.config.js — it may only reach
 * `products/*\/routes`). A URL is not an internal; the router already knows
 * `dms/*` and `crm/*` exist. So the list of links lives here, and a product
 * stays free to change everything behind those URLs.
 *
 * ADDING A LINK IS NOT THE SAME AS BUILDING A SCREEN. A link here with no
 * route behind it in `products/<app>/routes.tsx` renders an empty page. Add
 * the route first.
 *
 * Nothing here is a permission. The sidebar hides links a user cannot use as a
 * convenience; the backend rejects the request regardless of what was shown.
 * Never treat a hidden link as a control — the URL is still typeable.
 */

export interface NavItem {
  /** Sidebar label. */
  label: string;
  /** Path relative to `/:orgSlug/<app key>/`. Empty string means the app root. */
  path: string;
  /**
   * Two letters for the collapsed rail, where there is no room for the label.
   *
   * Spelled out rather than sliced off `label`: "Sales" and "Service" both
   * start with S, so a `label.slice(0, 2)` rail reads "Sa Se Te" at best and
   * "S S T" at worst — two identical buttons going to different places.
   * Choosing them by hand makes a collision a visible decision.
   *
   * These become icons when there is an icon set. Until then, letters that
   * differ beat icons that are invented on the spot.
   */
  short: string;
}

export interface AppDefinition {
  /** The URL segment: `/:orgSlug/<key>`. */
  key: string;
  name: string;
  /** One line, shown in the app launcher. */
  description: string;
  /** Two letters for the launcher tile. */
  initials: string;
  nav: NavItem[];
}

/**
 * E-commerce is deliberately absent. It is deferred (see CLAUDE.md) and putting
 * a tile in the launcher for an app nobody is building would promise something
 * that does not exist.
 */
export const APPS: AppDefinition[] = [
  {
    key: "dms",
    name: "DMS",
    description: "Dealership management",
    initials: "DM",
    /*
     * UNSETTLED — this is Q19 in context/04-OPEN-QUESTIONS.md.
     *
     * These three are the modules that actually have backend scaffolding
     * behind them. The original design docs list a longer set (dealers,
     * catalog, enquiries, quotations, inventory, dashboard) and the two lists
     * have not been reconciled. In particular ORG-LEVEL DEALER MANAGEMENT HAS
     * NO HOME HERE YET, and C3 makes it non-optional.
     *
     * When Q19 is answered, this array is the only thing that changes.
     */
    nav: [
      { label: "Sales", path: "sales", short: "SL" },
      { label: "Service", path: "service", short: "SV" },
      { label: "Tech support", path: "tech-support", short: "TS" },
    ],
  },
  {
    key: "crm",
    name: "CRM",
    description: "Customer relationships",
    initials: "CR",
    // Built after DMS ships. An empty sidebar is honest; invented links are not.
    nav: [],
  },
];

export function findApp(key: string | undefined): AppDefinition | undefined {
  return APPS.find((app) => app.key === key);
}

/**
 * Where someone lands when the URL names an organisation but no app —
 * `/acme-motors` on its own, usually from a bookmark or a typed address.
 *
 * A literal, not `APPS[0].key`: `noUncheckedIndexedAccess` makes that
 * `string | undefined`, and a redirect target that might be undefined is a
 * blank screen waiting to happen.
 */
export const DEFAULT_APP_KEY = "dms";
