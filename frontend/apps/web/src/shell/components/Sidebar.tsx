/**
 * Navigation within the current app.
 *
 * Two levels, because a module is not a screen: Sales is a module that owns
 * Enquiries, Quotations and the rest. A group with no label renders its items
 * with no heading, which is how DMS looks until those screens exist.
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
      <div className={styles.groups}>
        {app.nav.map((group, groupIndex) => (
          <div
            // Groups have no id of their own and an unlabelled group has no
            // name either, so the index is the only stable key available. Safe
            // here because this list is static config, never reordered at runtime.
            key={group.label ?? `group-${String(groupIndex)}`}
            className={styles.group}
          >
            {group.label && <div className={styles.groupLabel}>{group.label}</div>}

            <ul className={styles.list}>
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={`/${orgSlug}/${app.key}/${item.path}`.replace(/\/$/, "")}
                    end={item.path === ""}
                    className={({ isActive }) =>
                      isActive ? `${styles.link} ${styles.linkActive}` : styles.link
                    }
                    // The label is hidden when collapsed, so the icon-only link
                    // gets a tooltip as well as its clipped accessible name.
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
          </div>
        ))}

        {app.nav.length === 0 && (
          <p className={styles.empty}>
            {/* Honest beats invented. CRM has no modules yet and saying so is
                better than links that lead nowhere. */}
            No modules yet.
          </p>
        )}
      </div>

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
