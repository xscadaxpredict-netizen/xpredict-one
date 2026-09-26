/**
 * A URL inside an organisation that matches no page.
 *
 * This exists because without it React Router renders its own developer error
 * page — "Unexpected Application Error! 404 Not Found" with a note addressed to
 * the developer. Every typo and every stale link showed that.
 *
 * WHY THIS IS A SCREEN AND NOT A REDIRECT, when the unopenable-app case a few
 * lines up in `AppShell` *is* a redirect: there, the launcher explains itself —
 * the app is sitting on it, visibly disabled, with the reason underneath.
 * Here there is nothing to explain, so silently moving someone to the launcher
 * would look like the link worked and the app is showing the wrong page.
 */

import { Link } from "react-router-dom";

import { useShellContext } from "../AppShell";
import styles from "./NotFoundScreen.module.css";

export function NotFoundScreen() {
  const { membership } = useShellContext();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.body}>
        That address does not match anything in {membership.org_name}. It may have moved,
        or the link may be out of date.
      </p>
      <Link className={styles.link} to={`/${membership.org_slug}`}>
        Back to your apps
      </Link>
    </div>
  );
}
