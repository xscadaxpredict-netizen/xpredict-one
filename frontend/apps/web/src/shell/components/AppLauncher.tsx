/**
 * The grid button in the topbar: which app am I in, and how do I get to another.
 *
 * Shows exactly what the launcher page shows — same `visibleApps` rule, same
 * `AppTile`. The dropdown is a shortcut to that screen, not a second opinion
 * about it.
 *
 * Built on Radix's dropdown menu rather than a hand-rolled popover. That is not
 * laziness — a menu has to close on Escape, close on outside click, trap and
 * restore focus, move with the arrow keys, and announce itself to a screen
 * reader. Radix does all of that; hand-rolled menus reliably do about two.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";

import type { Membership } from "../api/auth";
import { visibleApps } from "../navigation";
import { AppTile } from "./AppTile";
import styles from "./AppLauncher.module.css";

interface AppLauncherProps {
  membership: Membership;
  /** The app currently open, so its tile can be marked. */
  currentAppKey: string | undefined;
}

export function AppLauncher({ membership, currentAppKey }: AppLauncherProps) {
  const navigate = useNavigate();
  const apps = visibleApps(membership);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Switch app">
        <GridIcon />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8} align="start">
          <DropdownMenu.Label className={styles.label}>Your apps</DropdownMenu.Label>

          <div className={styles.grid}>
            {apps.map((app) => (
              /*
               * `asChild` so the tile's own <button> IS the menu item, rather
               * than a button nested inside one. Nested interactive elements
               * are what produce the bug where the first Enter opens the app
               * and the second does nothing.
               */
              <DropdownMenu.Item
                key={app.definition.key}
                asChild
                disabled={!app.enabled}
                onSelect={() => void navigate(`/${membership.org_slug}/${app.definition.key}`)}
              >
                <AppTile
                  app={app}
                  isCurrent={app.definition.key === currentAppKey}
                  // Radix drives selection through onSelect above; the tile's
                  // own handler would fire a second navigation.
                  onOpen={() => undefined}
                />
              </DropdownMenu.Item>
            ))}
          </div>

          <DropdownMenu.Separator className={styles.separator} />

          <DropdownMenu.Item
            className={styles.allApps}
            onSelect={() => void navigate(`/${membership.org_slug}`)}
          >
            All apps
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {[1, 6.5, 12].map((y) =>
        [1, 6.5, 12].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.75" fill="currentColor" />
        )),
      )}
    </svg>
  );
}
