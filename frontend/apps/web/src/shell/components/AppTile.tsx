/**
 * One app, as a card on the launcher.
 *
 * THE CARD IS NOT CLICKABLE — the button inside it is.
 *
 * It used to be one large button. Putting a button inside that would nest one
 * interactive element inside another: the browser gives you two tab stops that
 * do the same thing, and a screen reader announces a button containing a
 * button. So the card is plain markup and the only thing you can activate is
 * the action at the bottom, which is also what makes the disabled state
 * honest — you can see the whole card and still not be able to open it.
 *
 * The button says "Open DMS" rather than "Open". Four cards whose buttons all
 * read "Open" give a screen-reader user a list of four identical controls with
 * no way to tell which is which.
 */

import type { LauncherApp } from "../navigation";
import { AppIcon } from "./AppIcon";
import styles from "./AppTile.module.css";

interface AppTileProps {
  app: LauncherApp;
  onOpen: () => void;
}

export function AppTile({ app, onOpen }: AppTileProps) {
  const { definition, access, enabled } = app;

  return (
    <div className={styles.card} data-disabled={!enabled || undefined}>
      {/* The app's colour comes from this attribute, so a new app needs a
          token and a catalog entry — not a change to this component. */}
      <span className={styles.icon} data-app={definition.key}>
        <AppIcon app={definition.key} />
      </span>

      {/* h2: the launcher's own h1 is "Your apps", and these sit under it. */}
      <h2 className={styles.name}>{definition.name}</h2>

      <p className={styles.description}>
        {enabled ? (access.summary ?? definition.description) : definition.description}
      </p>

      {/*
        Above the button, not below it. Below, this line pushed the button up
        and that one card's action no longer lined up with the other three.
      */}
      {!enabled && <p className={styles.hint}>Ask an owner to enable this app</p>}

      {/*
        `margin-top: auto` on the action in CSS, so the buttons line up across
        cards whose descriptions run to different lengths. Without it each
        button floats at the bottom of its own text and the row looks broken.
      */}
      {enabled ? (
        <button type="button" className={styles.action} onClick={onOpen}>
          Open {definition.name}
        </button>
      ) : (
        <button
          type="button"
          className={styles.action}
          disabled
          // Visible text says "Not subscribed"; the name is only in the
          // accessible name, so the button is identifiable without repeating
          // the heading directly above it on screen.
          aria-label={`${definition.name} is not subscribed`}
        >
          Not subscribed
        </button>
      )}
    </div>
  );
}
