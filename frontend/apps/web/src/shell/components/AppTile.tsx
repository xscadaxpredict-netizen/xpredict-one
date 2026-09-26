/**
 * One app, as a tile. Used by the launcher page and by the topbar dropdown.
 *
 * Shared rather than written twice because the two placements must agree about
 * what a disabled app looks like. Two copies drift, and the copy that drifts is
 * always the one that stops explaining why an app cannot be opened.
 *
 * A disabled tile is a `button`, not a `div`: it stays in the tab order, still
 * announces itself, and says why. Removing it from the page entirely is what we
 * do for apps the person may not see at all — that decision is made in
 * `visibleApps`, not here.
 */

import type { LauncherApp } from "../navigation";
import styles from "./AppTile.module.css";

interface AppTileProps {
  app: LauncherApp;
  /** Marks the app currently open. Only meaningful inside the dropdown. */
  isCurrent?: boolean;
  onOpen: () => void;
}

export function AppTile({ app, isCurrent = false, onOpen }: AppTileProps) {
  const { definition, access, enabled } = app;

  return (
    <button
      type="button"
      className={styles.tile}
      data-current={isCurrent || undefined}
      data-disabled={!enabled || undefined}
      disabled={!enabled}
      onClick={onOpen}
    >
      <span className={styles.mark} aria-hidden="true">
        {definition.initials}
      </span>

      <span className={styles.name}>{definition.name}</span>

      <span className={styles.description}>
        {enabled ? definition.description : "Not subscribed"}
      </span>

      {/*
        The bottom line is whichever is more useful: a fact from the server
        ("across 12 dealers"), or the way out of a locked tile. An unsubscribed
        app with no route to buying it is just a closed door.
      */}
      <span className={styles.summary}>
        {enabled ? access.summary : "Ask an owner to enable this app"}
      </span>
    </button>
  );
}
