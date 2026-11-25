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

import type { Gate } from "./access";
import type { AppAccess, AppKey, Membership } from "./api/auth";
import type { NavIconName } from "./components/NavIcon";

/**
 * One link in an app's sidebar, and the GATE that decides whether it shows:
 * `section` (an app on the section tree, C79), `permission` or `module` (DMS)
 * -- see `Gate` in `access.ts`.
 *
 * THE GATE IS REQUIRED, not optional, and that is the point. An optional field
 * is one a developer adding a screen at 5pm does not notice; a required one is
 * a compile error. `module: null` is allowed but has to be typed deliberately,
 * so it shows up in a diff as a decision rather than an omission.
 */
export type NavItem = NavItemFields & Gate;

interface NavItemFields {
  /** Sidebar label. */
  label: string;
  /** Path relative to `/:orgSlug/<app key>/`. Empty string means the app root. */
  path: string;
  /**
   * The icon beside the label, and the only thing left once the rail is
   * collapsed to 64px.
   *
   * Required, like the gate — a new screen has to choose one, and a
   * missing icon is a compile error rather than a blank square nobody spots.
   * Icons are named by what they draw, so picking one is not a claim that no
   * other module may use it.
   */
  icon: NavIconName;

  /**
   * What the topbar's search box searches while this page is open, as a
   * plural noun: "applications" makes the box say "Search applications" and
   * the page filters by what is typed (C78, `pageSearchStore`). Left out, the
   * box is the general search it always was.
   *
   * A PAGE WITH TABS gives a function of the address below the item's own
   * path ("app-admins", "" for the first tab), so the box searches whichever
   * tab is open. Each tab is its own address, so switching tab empties the box
   * like switching page does.
   */
  search?: string | ((rest: string) => string);

  /**
   * THE TABS OF THIS SUB-MODULE (C79), when it has any: the bottom level of
   * the owner's structure, module -> sub-module -> tab, the same tree `/me`
   * sends. In order. The page draws its tab row from here, so the tabs are
   * written once, beside the sub-module they belong to.
   */
  tabs?: NavTab[];
}

/** One tab of a sub-module's page (C79). Each is its own address. */
export interface NavTab {
  label: string;
  /** Below the sub-module's path: "" for the first tab, which is the page's own address. */
  path: string;
  /** Its section in the tree: drawn only if `/me`'s tree has it. */
  section: string;
  /** Planned, not built: drawn greyed out, never opened (App Admins, Q63). */
  comingSoon?: true;
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
  /**
   * The MODULE's own icon, drawn on its accordion row (C78): a group is a row
   * you open and close, and its items are the sub-modules underneath. Every
   * sidebar is that accordion since 2026-11-25 (the owner), products included.
   */
  icon?: NavIconName;
  /**
   * Shown greyed out with "Soon", and cannot be opened: a module that is
   * planned but not built (the Admin panel's Dashboard). Kept even with no
   * items, so the plan is visible.
   */
  comingSoon?: boolean;
  items: NavItem[];
}

export interface AppDefinition {
  key: AppKey;
  name: string;
  /** One line under the name in the launcher. Copy, not data. */
  description: string;
  /** Two letters for the launcher tile. */
  initials: string;
  /**
   * The heading this app sits under in the topbar's apps panel. Copy, not data
   * --- the same kind of string as `description`, and grouping changes nothing
   * about whether the app can be opened.
   */
  section: AppSection;
  /**
   * A PRODUCT is something you work in: it has a tile in the launcher and a
   * row in the apps panel. A SETTINGS area is somewhere you go to configure
   * things: no tile and no row, reached from its own button in the topbar
   * (C78).
   *
   * Required, like `module` on a nav item: a new app has to say which it is.
   */
  kind: "product" | "settings";
  nav: NavGroup[];
  /**
   * THE APP'S OWN SETTINGS (C78), reached from the gear in the topbar: a full
   * page at `/<org>/<app>/settings` whose sidebar is this accordion of modules
   * instead of the app's `nav`. Paths are relative to that address. Left out,
   * the app has no settings and no gear.
   */
  settings?: NavGroup[];
}

/** The path segment every app's settings live under (C78): `/<org>/<app>/settings`. */
export const APP_SETTINGS_SEGMENT = "settings";

/**
 * The panel's headings, in the order they are shown. A list rather than the
 * order apps happen to appear in the catalogue, so adding an app to an
 * existing section cannot reorder the headings.
 */
export const APP_SECTIONS = ["Operations", "Sales & marketing", "Platform"] as const;
export type AppSection = (typeof APP_SECTIONS)[number];

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
    description: "Dealer Management System (DMS)",
    // TWO LETTERS like every app badge (merge, 2026-11-23): `main`'s "DMS"
    // repeated the app's own name beside it.
    initials: "DM",
    section: "Operations",
    kind: "product",
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
        label: "Overview",
        icon: "grid",
        items: [
          // The one dashboard: each module's panel, shown only to people whose role
          // holds that module (the same rule as the links below), filterable by name.
          { label: "Welcome Hub", path: "", icon: "grid", module: null },
        ],
      },
      // No "Configuration" group: Load Master Data moved behind the gear as
      // DMS settings -> Masters (the owner, 2026-11-25).
      {
        label: "Sales",
        icon: "tag",
        items: [
          { label: "Enquiries", path: "sales/enquiries", icon: "users", module: "sales" },
          { label: "Confirmed orders", path: "sales/orders", icon: "clipboard-check", module: "sales" },
          { label: "Quotations", path: "sales/quotations", icon: "file-text", module: "sales" },
          { label: "Techno-Commercial", path: "sales/techno-commercial", icon: "file-text", module: "sales" },
          { label: "Commissions", path: "sales/commissions", icon: "percent", module: "sales" },
        ],
      },
      {
        label: "Site Services",
        icon: "wrench",
        items: [
          { label: "AMC", path: "site-services/amc", icon: "shield-check", module: "service" },
          { label: "Scheduled Services", path: "site-services/scheduling", icon: "calendar", module: "service" },
          { label: "Service Reports", path: "site-services/reports", icon: "clipboard-check", module: "service" },
          { label: "Water Reports", path: "site-services/water", icon: "droplet", module: "service" },
          { label: "Complaint Box", path: "site-services/complaints", icon: "alert-circle", module: "service" },
        ],
      },

      {
        label: "Installation & Tech Support",
        icon: "headset",
        items: [
          { label: "User Manuals", path: "tech-support/manuals", icon: "book-open", module: "tech-support" },
          { label: "Machine Videos", path: "tech-support/videos", icon: "video", module: "tech-support" },
          { label: "Request for Call", path: "tech-support/calls", icon: "phone-call", module: "tech-support" },
          { label: "Timer Calculation", path: "tech-support/timer-calculation", icon: "clock", module: "tech-support" },
        ],
      },

      {
        label: "E-Commerce",
        icon: "store",
        items: [
          { label: "Store Catalog", path: "ecommerce/catalog", icon: "store", module: "ecommerce" },
          { label: "My Orders", path: "ecommerce/orders", icon: "package", module: "ecommerce" },
        ],
      },
      {
        label: "Tools",
        icon: "calculator",
        items: [
          { label: "Marketing Kit", path: "tools/marketing", icon: "tag", module: "tools" },
          { label: "Capacity Calculator", path: "tools/calculator", icon: "calculator", module: "tools" },
          { label: "EC Dosing & HRT", path: "tools/ec-dosing", icon: "zap", module: "tools" },
          { label: "Feasibility", path: "tools/feasibility", icon: "compass", module: "tools" },
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
    /*
     * DMS SETTINGS, behind the gear (C78, C82; the owner 2026-11-23). The two
     * modules C82 gives DMS, DRAWN ONLY: every page says it is being built.
     * The gear and these pages are the OWNER'S alone until the app-admin role
     * is designed (Q63) -- `canOpenAppSettings()` -- so the items carry
     * `module: null` deliberately: the whole area is gated, not each link.
     */
    settings: [
      {
        label: "Users & Roles",
        icon: "users",
        items: [
          { label: "Users", path: "users", icon: "users", module: null, search: "users" },
          { label: "Roles", path: "roles", icon: "key", module: null },
        ],
      },
      {
        label: "Security & Controls",
        icon: "shield-check",
        items: [
          {
            label: "Territory Management",
            path: "territories",
            icon: "compass",
            module: null,
            search: "territories",
          },
          { label: "Position Hierarchy", path: "position-hierarchy", icon: "user", module: null },
        ],
      },
      {
        // What was DMS's "Load Master Data" page; each sub-module is one of its
        // old tabs (the owner, 2026-11-25). Owner only, like the rest of the gear.
        label: "Masters",
        icon: "database",
        items: [
          { label: "Bank Accounts", path: "bank-accounts", icon: "card", module: null, search: "bank accounts" },
          { label: "Product Catalog", path: "product-catalog", icon: "package", module: null, search: "products" },
          { label: "User Manuals", path: "user-manuals", icon: "book-open", module: null, search: "manuals" },
          { label: "Machine Videos", path: "machine-videos", icon: "video", module: null, search: "videos" },
          { label: "Marketing Kit", path: "marketing-kit", icon: "tag", module: null, search: "materials" },
          { label: "Calculator Constants", path: "calculator-constants", icon: "calculator", module: null },
        ],
      },
    ],
  },
  {
    key: "crm",
    name: "CRM",
    description: "Leads & marketing",
    initials: "CR",
    section: "Sales & marketing",
    kind: "product",
    // Built after DMS ships. An empty sidebar is honest; invented links are not.
    nav: [],
  },
  {
    key: "ecommerce",
    name: "E-commerce",
    description: "Storefront & orders",
    initials: "EC",
    section: "Sales & marketing",
    kind: "product",
    nav: [],
  },
  {
    /*
     * THE ADMIN PANEL (C78). Still an entry here, because the shell draws its
     * name block and sidebar from this catalogue like any app's -- but a
     * settings area, not a product: no launcher tile, reached from the shield
     * in the topbar. The sections below are today's screens, kept until the
     * owner's list of modules and sub-modules replaces them.
     */
    key: "admin",
    name: "Admin panel",
    description: "Dealers, people, billing",
    initials: "AD",
    section: "Platform",
    kind: "settings",
    /*
     * The owner's modules and sub-modules (2026-11-17), drawn as an accordion.
     *
     * EACH SUB-MODULE IS GATED BY ITS OWN SECTION (C79): it shows if `/me`'s
     * tree has it, i.e. if the person holds the `view` of it or of a tab under
     * it. A module shows if any of its sub-modules does. A dealer admin sees
     * Users alone; Profile, Applications and Admins and Roles are about the
     * WHOLE organisation.
     *
     * NO DEALERS HERE: its screen went on 2026-11-25 (Q79). Dealers are
     * territories, managed in DMS settings -> Territory Management.
     */
    nav: [
      { label: "Dashboard", icon: "gauge", comingSoon: true, items: [] },
      {
        label: "Organization",
        icon: "building",
        items: [{ label: "Profile", path: "profile", icon: "building", section: "profile" }],
      },
      {
        label: "App Management",
        icon: "grid",
        items: [
          {
            label: "Applications",
            path: "applications",
            icon: "grid",
            section: "application",
            search: "applications",
          },
        ],
      },
      {
        label: "User Management",
        icon: "user",
        items: [
          { label: "Users", path: "users", icon: "users", section: "user", search: "users" },
          // ONE sub-module, as Zoho has it (the owner, 2026-11-18), with three
          // tabs: Admins, App Admins (greyed out until it has a page), Roles.
          {
            label: "Admins and Roles",
            path: "admins-and-roles",
            icon: "key",
            section: "admins_and_roles",
            search: (tab) => (tab.startsWith("roles") ? "roles" : "admins"),
            tabs: [
              { label: "Admins", path: "", section: "admin" },
              { label: "App Admins", path: "app-admins", section: "app_admin", comingSoon: true },
              { label: "Roles", path: "roles", section: "role" },
            ],
          },
        ],
      },
    ],
  },
];

export function findApp(key: string | undefined): AppDefinition | undefined {
  return APP_CATALOG.find((app) => app.key === key);
}

/**
 * The tabs of one sub-module's page, from the catalogue: `tabsOf("admin",
 * "admins-and-roles")`.
 *
 * THROWS if the page is not in the catalogue or has no tabs, rather than
 * returning none: a page with an empty tab row would look like somebody had
 * lost access, when it is a typo in the code.
 */
export function tabsOf(appKey: AppKey, path: string): NavTab[] {
  const item = findApp(appKey)
    ?.nav.flatMap((group) => group.items)
    .find((candidate) => candidate.path === path);
  if (!item?.tabs) throw new Error(`No tabs for ${appKey}/${path} in APP_CATALOG`);
  return item.tabs;
}

/**
 * What the topbar's search box searches at `pathname` ("applications",
 * "admins"), or undefined for the general search. See `NavItem.search`.
 */
export function pageSearchLabel(
  app: AppDefinition | undefined,
  orgSlug: string,
  pathname: string,
): string | undefined {
  const item = currentNavItem(app, orgSlug, pathname);
  if (!item?.search || !app) return undefined;
  if (typeof item.search === "string") return item.search;

  const own = `${sidebarOf(app, orgSlug, pathname).base}${item.path}`;
  return item.search(pathname.slice(own.length).replace(/^\//, ""));
}

/**
 * The sidebar item for the page at `pathname`, if any: the one whose path the
 * address is, or starts with followed by a slash (`users/42` is Users).
 *
 * INSIDE AN APP'S SETTINGS (C78) it is a settings item, read against
 * `/<org>/<app>/settings/` -- the sidebar showing there is the settings one.
 */
export function currentNavItem(
  app: AppDefinition | undefined,
  orgSlug: string,
  pathname: string,
): NavItem | undefined {
  if (!app) return undefined;
  const { base, groups } = sidebarOf(app, orgSlug, pathname);
  if (!pathname.startsWith(base)) return undefined;
  const rest = pathname.slice(base.length);

  return groups
    .flatMap((group) => group.items)
    .find((item) => item.path !== "" && (rest === item.path || rest.startsWith(`${item.path}/`)));
}

/** Which sidebar is showing at `pathname`, and the address its paths are relative to. */
function sidebarOf(
  app: AppDefinition,
  orgSlug: string,
  pathname: string,
): { base: string; groups: NavGroup[] } {
  if (app.settings !== undefined && isInAppSettings(app, orgSlug, pathname)) {
    return { base: `/${orgSlug}/${app.key}/${APP_SETTINGS_SEGMENT}/`, groups: app.settings };
  }
  return { base: `/${orgSlug}/${app.key}/`, groups: app.nav };
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
 * The apps to draw as tiles in the launcher and rows in the apps panel:
 * `visibleApps()`, products only.
 *
 * A NARROWER LIST, NOT A DIFFERENT RULE. `visibleApps()` still answers "what
 * may I open" -- the shell's route guard asks it, and the Admin panel must
 * stay openable -- so the settings areas are dropped here, where only the
 * drawing is decided, and not there (C78).
 */
export function launcherApps(membership: Membership): LauncherApp[] {
  return visibleApps(membership).filter((app) => app.definition.kind === "product");
}

/**
 * May this person open the Admin panel? Decides whether the topbar shows the
 * shield. The same entitlement rule as everything else -- `visibleApps()` --
 * so the button and the route guard cannot disagree.
 */
export function canOpenAdminPanel(membership: Membership): boolean {
  return visibleApps(membership).some((app) => app.definition.key === "admin" && app.enabled);
}

/**
 * Whether this person gets the gear for `app`'s settings (C78), and may open them.
 *
 * THE OWNER ONLY, FOR NOW (the owner, 2026-11-23): app settings belong to an
 * app admin, and that role is not designed yet (C82, Q63). When it is, it is
 * added HERE, the one place that answers the question -- the gear, the
 * settings sidebar and the route guard all ask this.
 *
 * Only a product with settings has a gear; the Admin panel has its shield.
 * COURTESY, NOT SECURITY: no settings page asks the server anything yet.
 */
export function canOpenAppSettings(
  membership: Membership,
  app: AppDefinition | undefined,
): boolean {
  return (
    app !== undefined &&
    app.kind === "product" &&
    app.settings !== undefined &&
    membership.role === "owner"
  );
}

/** Whether `pathname` is inside `app`'s settings (`/<org>/<app>/settings...`). */
export function isInAppSettings(
  app: AppDefinition | undefined,
  orgSlug: string,
  pathname: string,
): boolean {
  if (app?.settings === undefined) return false;
  const base = `/${orgSlug}/${app.key}/${APP_SETTINGS_SEGMENT}`;
  return pathname === base || pathname.startsWith(`${base}/`);
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
