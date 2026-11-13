/**
 * The grid button at the right of the topbar, and the panel it opens: every
 * app in the suite, grouped under a heading, with a filter at the top.
 *
 * WHICH apps appear is not decided here. It is `visibleApps()`, the same rule
 * the launcher page uses, so the two cannot drift: subscribed and open is a
 * row you can click, not subscribed is a greyed row that says so (C16), and
 * subscribed but not yours is not listed at all (C22). This file only decides
 * how that list is drawn.
 *
 * A drawer at the right edge (`TopbarDrawer`), not a menu. The old switcher
 * was a dropdown menu, which is right for a short list of commands; this has a
 * text field in it, and a menu steals the arrow keys and the typing that a
 * filter needs.
 */

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Membership } from "../api/auth";
import { APP_SECTIONS, visibleApps } from "../navigation";
import { AppIcon } from "./AppIcon";
import { DrawerClose, DrawerTitle, TopbarDrawer } from "./TopbarDrawer";
import styles from "./AppsPanel.module.css";

interface AppsPanelProps {
  membership: Membership;
  /** The app currently open, so its row can be marked. */
  currentAppKey: string | undefined;
}

export function AppsPanel({ membership, currentAppKey }: AppsPanelProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /*
   * The search sits behind an icon in the header, as Zoho's does: the icon
   * opens a box in its place, and the box folds back into the icon when you
   * move on. Five apps do not need a search field taking a row of their own.
   */
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  // Set when the box closes from the keyboard, so focus goes back to the icon
  // rather than to the top of the page.
  const refocusIcon = useRef(false);

  useEffect(() => {
    if (searching) {
      searchRef.current?.focus();
    } else if (refocusIcon.current) {
      refocusIcon.current = false;
      searchButtonRef.current?.focus();
    }
  }, [searching]);

  function closeSearch(returnFocus: boolean) {
    refocusIcon.current = returnFocus;
    setQuery("");
    setSearching(false);
  }

  const needle = query.trim().toLowerCase();
  const apps = visibleApps(membership).filter(
    (app) =>
      needle === "" ||
      app.definition.name.toLowerCase().includes(needle) ||
      app.definition.description.toLowerCase().includes(needle),
  );

  // Headings in their fixed order, and a heading with nothing under it is
  // dropped rather than left hanging over an empty list.
  const sections = APP_SECTIONS.map((title) => ({
    title,
    apps: apps.filter((app) => app.definition.section === title),
  })).filter((section) => section.apps.length > 0);

  function changeOpen(next: boolean) {
    setOpen(next);
    // A filter left over from last time would hide apps without saying why.
    if (!next) {
      setQuery("");
      setSearching(false);
    }
  }

  function go(path: string) {
    changeOpen(false);
    void navigate(path);
  }

  return (
    <TopbarDrawer
      open={open}
      onOpenChange={changeOpen}
      triggerLabel="All apps"
      tooltip="All apps"
      triggerClassName={styles.trigger}
      triggerContent={<GridIcon />}
      // Escape with the search open closes the SEARCH, not the drawer: the
      // person pressing it is backing out of what they were typing.
      onEscapeKeyDown={(event) => {
        if (!searching) return;
        event.preventDefault();
        closeSearch(true);
      }}
    >
      <div className={styles.header}>
        <DrawerTitle className={styles.title}>All apps</DrawerTitle>

        {searching ? (
          <div className={styles.searchBox}>
            <SearchIcon size={16} className={styles.searchBoxIcon} aria-hidden="true" />
            <label htmlFor="apps-panel-search" className={styles.visuallyHidden}>
              Find an app
            </label>
            <input
              id="apps-panel-search"
              ref={searchRef}
              type="search"
              className={styles.searchInput}
              placeholder="Search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              /*
               * Folds back into the icon when you click elsewhere — but ONLY
               * if it is empty. With text in it the list below is filtered,
               * and hiding the box would leave a short list with nothing
               * saying why. It also keeps the list still under the pointer: a
               * box that cleared itself on blur would reshuffle the rows
               * between pressing on an app and letting go.
               */
              onBlur={() => {
                if (query.trim() === "") closeSearch(false);
              }}
            />
            {/* Our own, not the browser's: each browser draws a different
                cross for type="search", and some none at all. */}
            {query !== "" && (
              <button
                type="button"
                className={styles.clear}
                aria-label="Clear search"
                // Keep the focus in the box. Without this the press would
                // blur it first, and an emptied box folds away under the
                // pointer before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <XIcon size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <button
            ref={searchButtonRef}
            type="button"
            className={styles.close}
            aria-label="Search apps"
            onClick={() => setSearching(true)}
          >
            <SearchIcon size={18} aria-hidden="true" />
          </button>
        )}

        <span className={styles.divider} aria-hidden="true" />
        <DrawerClose className={styles.close} aria-label="Close apps">
          <CloseIcon />
        </DrawerClose>
      </div>

      <div className={styles.body}>
        {sections.map((section) => (
          <section key={section.title} className={styles.section}>
            <h3 className={styles.sectionTitle}>{section.title}</h3>

            <ul className={styles.list}>
              {section.apps.map(({ definition, enabled }) => {
                const isCurrent = definition.key === currentAppKey;
                const content = (
                  <>
                    <span className={styles.icon} data-app={definition.key}>
                      <AppIcon app={definition.key} size={22} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>{definition.name}</span>
                      <span className={styles.description}>{definition.description}</span>
                    </span>
                  </>
                );

                return (
                  <li key={definition.key}>
                    {enabled ? (
                      <button
                        type="button"
                        className={styles.row}
                        aria-current={isCurrent ? "page" : undefined}
                        data-current={isCurrent || undefined}
                        onClick={() => go(`/${membership.org_slug}/${definition.key}`)}
                      >
                        {content}
                        <ChevronIcon />
                      </button>
                    ) : (
                      // Not a disabled button: there is nothing to press, and
                      // a focus stop that does nothing is a dead end for a
                      // keyboard user. The note says why it cannot be opened.
                      <div className={styles.row} data-disabled="">
                        {content}
                        <span className={styles.note}>Not subscribed</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {sections.length === 0 && <p className={styles.empty}>No app matches that name.</p>}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.footerLink}
          onClick={() => go(`/${membership.org_slug}`)}
        >
          Open the launcher
        </button>
      </div>
    </TopbarDrawer>
  );
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {[5, 12, 19].map((cy) =>
        [5, 12, 19].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" fill="currentColor" />),
      )}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className={styles.chevron}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
