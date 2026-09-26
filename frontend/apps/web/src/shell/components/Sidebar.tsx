/**
 * Navigation within the current app.
 *
 * `NavLink` rather than `Link` because it knows whether it is the current page
 * and hands us that as `isActive`. Doing it by hand means comparing pathnames
 * in every link, and getting the trailing-slash and nested-route cases wrong.
 *
 * `end` is set on the app-root link only. Without it, a link to `/dms` counts
 * itself active on `/dms/sales` too, because "active" means "the URL starts
 * with this" — and you get two highlighted items at once.
 */

import { NavLink } from "react-router-dom";

import type { AppDefinition } from "../navigation";
import { useUiStore } from "../../stores/uiStore";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  app: AppDefinition;
  orgSlug: string;
}

export function Sidebar({ app, orgSlug }: SidebarProps) {
  /*
   * Selecting one field at a time, not the whole store. `useUiStore()` with no
   * selector re-renders this component on every change to any field in the
   * store; this way it only re-renders when the collapsed flag itself changes.
   */
  const isCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <nav
      className={styles.sidebar}
      data-collapsed={isCollapsed || undefined}
      aria-label={`${app.name} navigation`}
    >
      <ul className={styles.list}>
        {app.nav.map((item) => (
          <li key={item.path}>
            <NavLink
              to={`/${orgSlug}/${app.key}/${item.path}`.replace(/\/$/, "")}
              end={item.path === ""}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
              // The label is hidden when collapsed, so the icon-only link needs
              // a name a screen reader and a tooltip can both use.
              title={isCollapsed ? item.label : undefined}
            >
              <span className={styles.bullet} aria-hidden="true">
                {item.short}
              </span>
              <span className={styles.linkLabel}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {app.nav.length === 0 && (
        <p className={styles.empty}>
          {/* Honest beats invented. CRM has no modules yet and saying so is
              better than links that lead nowhere. */}
          No modules yet.
        </p>
      )}

      <button
        type="button"
        className={styles.collapse}
        onClick={toggleSidebar}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
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
    </nav>
  );
}
