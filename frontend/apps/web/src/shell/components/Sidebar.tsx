/**
 * Navigation within the current app.
 *
 * Two levels, because a module is not a screen: Sales is a module that owns
 * Enquiries, Quotations and the rest. Drawn as the accordion every sidebar
 * shares (`AccordionNav`, C78): a module is a row that opens and closes, its
 * sub-modules the links underneath, and the open one is remembered.
 */

import { useLocation } from "react-router-dom";

import { APP_SETTINGS_SEGMENT, isInAppSettings, type AppDefinition } from "../navigation";
import { allows, useAccess } from "../access";
import { useUiStore } from "../../stores/uiStore";
import { AccordionNav } from "./AccordionNav";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  app: AppDefinition;
  orgSlug: string;
  /**
   * Rendered inside the mobile drawer rather than as the desktop rail.
   *
   * Changes two things: it is never collapsed (a drawer you opened on purpose
   * should not open at 64px wide), and it has no collapse control, because the
   * drawer's own close button already does that job.
   */
  inDrawer?: boolean;
  /** Called after following a link, so the drawer can close behind you. */
  onNavigate?: () => void;
}

export function Sidebar({ app, orgSlug, inDrawer = false, onNavigate }: SidebarProps) {
  /*
   * Selecting one field at a time, not the whole store. `useUiStore()` with no
   * selector re-renders this component on every change to any field in the
   * store; this way it only re-renders when the collapsed flag itself changes.
   */
  const collapsedPreference = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const access = useAccess();
  const { pathname } = useLocation();

  const isCollapsed = inDrawer ? false : collapsedPreference;

  /*
   * INSIDE AN APP'S SETTINGS (C78) the app's own links give way to its settings
   * modules, drawn as the same accordion as the Admin panel's. Who may be here
   * at all is decided once, by the route guard (`canOpenAppSettings`).
   */
  if (app.settings !== undefined && isInAppSettings(app, orgSlug, pathname)) {
    const settingsGroups = app.settings
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allows(access, item)),
      }))
      .filter((group) => group.items.length > 0 || group.comingSoon);

    return (
      <nav
        className={styles.sidebar}
        data-collapsed={isCollapsed || undefined}
        data-drawer={inDrawer || undefined}
        aria-label={`${app.name} settings navigation`}
      >
        <div className={styles.groups}>
          <AccordionNav
            appKey={`${app.key}/${APP_SETTINGS_SEGMENT}`}
            orgSlug={orgSlug}
            groups={settingsGroups}
            isCollapsed={isCollapsed}
            onNavigate={onNavigate}
          />
        </div>
        {!inDrawer && <CollapseButton isCollapsed={isCollapsed} onToggle={toggleSidebar} />}
      </nav>
    );
  }

  /*
   * Drop modules this person cannot open, then drop groups that are left
   * empty — otherwise a heading like "Sales" hangs over nothing, which
   * tells the reader precisely what they are not allowed to see.
   *
   * SILENTLY. The UI mock showed a line reading "Tech support hidden — your
   * role has no access", and that was deliberately not copied: C16 settled that
   * a permission the person lacks is hidden rather than advertised. Naming the
   * module in order to say they cannot have it gives away the same thing the
   * hiding was for.
   */
  const groups = app.nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allows(access, item)),
    }))
    // A "Soon" module has no items on purpose and stays, so the plan shows.
    .filter((group) => group.items.length > 0 || group.comingSoon);

    console.log(groups);
  return (
    <nav
      className={styles.sidebar}
      data-collapsed={isCollapsed || undefined}
      data-drawer={inDrawer || undefined}
      aria-label={`${app.name} navigation`}
    >
      {/*
        * EVERY SIDEBAR IS THE ACCORDION (C78; an app's own since 2026-11-25,
        * the owner): one module open at a time, and the one left open comes
        * back after a refresh (`uiStore.openSettingsModule`, keyed by app).
        * The permission filter above has already run, so the accordion only
        * ever draws what this person may open.
        */}
      <div className={styles.groups}>
        <AccordionNav
          appKey={app.key}
          orgSlug={orgSlug}
          groups={groups}
          isCollapsed={isCollapsed}
          onNavigate={onNavigate}
        />

        {groups.length === 0 && (
          <p className={styles.empty}>
            {/* Covers both "this app has no modules yet" (CRM) and "none of
              them are yours". Deliberately the same sentence: a different
              message for the second case would confirm that modules exist. */}
            No modules yet.
          </p>
        )}
      </div>

      {!inDrawer && <CollapseButton isCollapsed={isCollapsed} onToggle={toggleSidebar} />}
    </nav>
  );
}

interface CollapseButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

/** The control at the foot of the rail that narrows it to icons and back. */
function CollapseButton({ isCollapsed, onToggle }: CollapseButtonProps) {
  return (
    <button
      type="button"
      className={styles.collapse}
      onClick={onToggle}
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!isCollapsed}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={isCollapsed ? "M5 3.5 8.5 7 5 10.5" : "M9 3.5 5.5 7 9 10.5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.collapseLabel}>Collapse</span>
    </button>
  );
}
