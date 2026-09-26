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
import { useAccess } from "../access";
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
  const access = useAccess();

  /*
   * Drop modules this person cannot open, then drop groups that are left
   * empty — otherwise a heading like "This dealer" hangs over nothing, which
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
      items: group.items.filter((item) => item.module === null || access.hasModule(item.module)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav
      className={styles.sidebar}
      data-collapsed={isCollapsed || undefined}
      aria-label={`${app.name} navigation`}
    >
      <div className={styles.groups}>
        {groups.map((group, groupIndex) => (
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

        {groups.length === 0 && (
          <p className={styles.empty}>
            {/* Covers both "this app has no modules yet" (CRM) and "none of
                them are yours". Deliberately the same sentence: a different
                message for the second case would confirm that modules exist. */}
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
