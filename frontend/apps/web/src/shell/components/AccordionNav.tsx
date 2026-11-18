/**
 * A settings area's sidebar, drawn as an accordion (C78), the way Zoho One's
 * admin panel is: each MODULE is a row you open and close, and its
 * SUB-MODULES are the links underneath.
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

  const hrefOf = (path: string) => `/${orgSlug}/${appKey}/${path}`;
  const isHere = (path: string) =>
    pathname === hrefOf(path) || pathname.startsWith(`${hrefOf(path)}/`);
  const current = groups.find((group) =>
    group.items.some((item) => isHere(item.path)),
  );

  // Nothing stored yet: the module of the page you are on.
  const open = stored === undefined ? (current?.label ?? null) : stored;

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
  const currentLabel = current?.label ?? null;
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
              title={isCollapsed ? label : undefined}
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
