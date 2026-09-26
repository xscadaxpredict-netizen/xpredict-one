/**
 * The grid button in the topbar: which app am I in, and how do I get to another.
 *
 * Built on Radix's dropdown menu rather than a hand-rolled popover. That is not
 * laziness — a menu has to close on Escape, close on outside click, trap and
 * restore focus, move with the arrow keys, and announce itself to a screen
 * reader. Radix does all of that; hand-rolled menus reliably do about two.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";

import { APPS, type AppDefinition } from "../navigation";
import styles from "./AppLauncher.module.css";

interface AppLauncherProps {
  orgSlug: string;
  /** The app currently open, so its tile can be marked. */
  currentAppKey: string | undefined;
}

export function AppLauncher({ orgSlug, currentAppKey }: AppLauncherProps) {
  const navigate = useNavigate();

  function open(app: AppDefinition) {
    void navigate(`/${orgSlug}/${app.key}`);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Switch app">
        <GridIcon />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8} align="start">
          <DropdownMenu.Label className={styles.label}>Apps</DropdownMenu.Label>

          <div className={styles.grid}>
            {APPS.map((app) => (
              <DropdownMenu.Item
                key={app.key}
                className={styles.tile}
                data-current={app.key === currentAppKey || undefined}
                onSelect={() => open(app)}
              >
                <span className={styles.mark} aria-hidden="true">
                  {app.initials}
                </span>
                <span className={styles.tileName}>{app.name}</span>
                <span className={styles.tileDescription}>{app.description}</span>
              </DropdownMenu.Item>
            ))}
          </div>
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
