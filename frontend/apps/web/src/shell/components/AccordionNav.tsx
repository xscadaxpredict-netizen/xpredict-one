/**
 * Every sidebar, drawn as an accordion (C78), the way Zoho One's admin panel
 * is: each MODULE is a row you open and close, and its SUB-MODULES are the
 * links underneath. Settings areas first; an app's own sidebar too since
 * 2026-11-25 (the owner: "our format, collapsible, remember what was open").
 *
 * ONE MODULE OPEN AT A TIME. Opening one closes the others; pressing the open
 * one closes it, which leaves none open.
 *
 * WHICH ONE IS OPEN:
 *   - Going to a page opens that page's module — whether by a sidebar link or
 *     by a button elsewhere ("Manage access" sending you to Users).
 *   - A refresh keeps whatever was open, including "none". The address bar
 *     already brings back the page; the store (`uiStore`, persisted) brings
 *     back the accordion.
 *   - The first visit ever, with nothing stored, opens the current page's
 *     module.
 *
 * Collapsed to the 64px rail there is no room for sub-modules: the rail shows
 * the module icons, and pressing one widens the sidebar with that module open.
 */

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";

import type { NavGroup } from "../navigation";
import { useUiStore } from "../../stores/uiStore";
import { NavIcon } from "./NavIcon";
import styles from "./AccordionNav.module.css";

interface AccordionNavProps {
  appKey: string;
  orgSlug: string;
  /** Already filtered to what this person may open. */
  groups: NavGroup[];
  isCollapsed: boolean;
  onNavigate?: () => void;
}

export function AccordionNav({
  appKey,
  orgSlug,
  groups,
  isCollapsed,
  onNavigate,
}: AccordionNavProps) {
  const { pathname } = useLocation();
  const stored = useUiStore((state) => state.openSettingsModule[appKey]);
  const setOpen = useUiStore((state) => state.setOpenSettingsModule);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  // An app's home page has the path "" (DMS's Welcome Hub): its address is the
  // app's own, with no trailing slash, and only that exact address is "here" --
  // otherwise every page of the app would count as the home page.
  const hrefOf = (path: string) => `/${orgSlug}/${appKey}/${path}`.replace(/\/$/, "");
  const isHere = (path: string) =>
    path === ""
      ? pathname === hrefOf(path)
      : pathname === hrefOf(path) || pathname.startsWith(`${hrefOf(path)}/`);
  const current = groups.find((group) =>
    group.items.some((item) => isHere(item.path)),
  );

  // Nothing stored yet: the module of the page you are on.
  const open =
    stored === undefined ? (current && !current.single ? (current.label ?? null) : null) : stored;

  /*
   * A NEW PAGE opens its module. Not on the first render — that is a refresh
   * or an arrival, and the stored choice wins — only when the address changes
   * while this sidebar is showing.
   *
   * Compared against the last address seen rather than "is this the first
   * run": React's development mode runs every effect twice on mount, and a
   * first-run flag would let the second run overwrite the stored choice.
   */
  const lastPathname = useRef(pathname);
  // A single-page module (Home) has nothing to open, so going there leaves the
  // accordion as it was.
  const currentLabel = current && !current.single ? (current.label ?? null) : null;
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (currentLabel !== null) setOpen(appKey, currentLabel);
  }, [pathname, currentLabel, appKey, setOpen]);

  function toggle(label: string) {
    if (isCollapsed) {
      setSidebarCollapsed(false);
      setOpen(appKey, label);
      return;
    }
    setOpen(appKey, open === label ? null : label);
  }

  return (
    <ul className={styles.modules}>
      {groups.map((group) => {
        const label = group.label ?? "";
        const icon = group.icon ? <NavIcon name={group.icon} /> : null;

        if (group.comingSoon) {
          return (
            <li key={label}>
              <div
                className={`${styles.module} ${styles.soon}`}
                aria-disabled="true"
                title={isCollapsed ? `${label} (coming soon)` : undefined}
              >
                <span className={styles.icon}>{icon}</span>
                <span className={styles.label}>{label}</span>
                <span className={styles.soonTag}>Soon</span>
              </div>
            </li>
          );
        }

        // A module with one page (DMS's Home): a plain link with the module's
        // icon, and a line under it separating it from the accordion.
        const onlyItem = group.items[0];
        if (group.single && onlyItem) {
          return (
            <li key={label} className={styles.singleItem}>
              <NavLink
                to={hrefOf(onlyItem.path)}
                className={styles.module}
                data-current={group === current || undefined}
                aria-current={group === current ? "page" : undefined}
                title={label}
                onClick={onNavigate}
              >
                <span className={styles.icon}>{icon}</span>
                <span className={styles.label}>{label}</span>
              </NavLink>
            </li>
          );
        }

        const isOpen = !isCollapsed && open === label;
        const listId = `${appKey}-module-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

        return (
          <li key={label}>
            <button
              type="button"
              className={styles.module}
              data-current={group === current || undefined}
              aria-expanded={isOpen}
              aria-controls={isOpen ? listId : undefined}
              // Always: on the rail the label is hidden, and a long one
              // ("Installation & Tech Support") is cut short at full width.
              title={label}
              onClick={() => toggle(label)}
            >
              <span className={styles.icon}>{icon}</span>
              <span className={styles.label}>{label}</span>
              <ChevronDownIcon
                size={16}
                className={styles.chevron}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <ul id={listId} className={styles.subModules}>
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={hrefOf(item.path)}
                      end={item.path === ""}
                      className={({ isActive }) =>
                        isActive
                          ? `${styles.subModule} ${styles.subModuleActive}`
                          : styles.subModule
                      }
                      onClick={onNavigate}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
