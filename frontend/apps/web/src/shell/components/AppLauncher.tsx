/**
 * The grid button in the topbar: which app am I in, and how do I get to another.
 *
 * ROWS HERE, CARDS ON THE LAUNCHER PAGE — and that is deliberate.
 *
 * These two used to share `AppTile` so they could not drift. What must not
 * drift is WHICH apps appear and whether they can be opened, and that still
 * cannot: both ask `visibleApps()`, which is the only place that rule lives.
 * How they are drawn is a different question. A launcher page has room to
 * explain each app; a dropdown reached mid-task does not, and four big cards
 * in a menu is a lot of screen to move past to reach "All apps".
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
import { AppIcon } from "./AppIcon";
import styles from "./AppLauncher.module.css";

interface AppLauncherProps {
  membership: Membership;
  /** The app currently open, so its row can be marked. */
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

          {apps.map((app) => {
            const isCurrent = app.definition.key === currentAppKey;

            return (
              <DropdownMenu.Item
                key={app.definition.key}
                className={styles.item}
                disabled={!app.enabled}
                data-current={isCurrent || undefined}
                onSelect={() => void navigate(`/${membership.org_slug}/${app.definition.key}`)}
              >
                <span className={styles.itemIcon} data-app={app.definition.key}>
                  <AppIcon app={app.definition.key} size={18} />
                </span>

                <span className={styles.itemName}>{app.definition.name}</span>

                {/* Says why a row cannot be chosen. A greyed row with no
                    explanation reads as a bug rather than a subscription. */}
                {!app.enabled && <span className={styles.itemNote}>Not subscribed</span>}
              </DropdownMenu.Item>
            );
          })}

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
