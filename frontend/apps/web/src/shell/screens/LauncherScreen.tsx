/**
 * Where you land after signing in: pick an app.
 *
 * WHY THIS IS A SCREEN AND NOT A REDIRECT. Login used to jump straight into
 * DMS. That only works if everyone has DMS — and they do not. Which apps exist
 * for you depends on what your organisation pays for and what your role allows,
 * so the app is a choice the server has to answer first. Redirecting into an
 * app somebody cannot open produces a "no access" screen as the first thing
 * they see after typing a correct password.
 *
 * The tiles come from `visibleApps`, shared with the topbar dropdown so the two
 * cannot disagree about what is shown or what is merely disabled.
 *
 * Note there is no `useQuery` here and no loading state. `AppShell` has already
 * resolved `/me` before this renders — it cannot draw the topbar without it —
 * so by the time this screen exists the answer is in the cache.
 */

import { useNavigate } from "react-router-dom";

import type { Membership } from "../api/auth";
import { useShellContext } from "../context";
import { AppTile } from "../components/AppTile";
import { visibleApps } from "../navigation";
import styles from "./LauncherScreen.module.css";

export function LauncherScreen() {
  const navigate = useNavigate();
  const { me, membership } = useShellContext();
  const apps = visibleApps(membership);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Your apps</h1>
        <p className={styles.subtitle}>
          In <strong>{membership.org_name}</strong> · you are {describeRole(membership)}
        </p>
      </div>

      {apps.length === 0 ? (
        /*
         * Reachable: a member of an organisation that has bought nothing, or
         * whose access was revoked app by app rather than by removing the
         * membership. Rare, and a blank page here looks like a broken build.
         */
        <p className={styles.empty}>
          No apps have been enabled for you yet. Ask an administrator of{" "}
          {membership.org_name} for access.
        </p>
      ) : (
        <div className={styles.grid}>
          {apps.map((app) => (
            <AppTile
              key={app.definition.key}
              app={app}
              onOpen={() => void navigate(`/${membership.org_slug}/${app.definition.key}`)}
            />
          ))}
        </div>
      )}

      {/*
        Organisation switching lives here as well as in the topbar, because this
        is the screen someone lands on when they are in the wrong one. Only
        rendered when there is somewhere else to go (C13).
      */}
      {me.memberships.length > 1 && (
        <div className={styles.switcher}>
          <span className={styles.switcherLabel}>Switch organisation</span>
          <div className={styles.switcherOptions}>
            {me.memberships.map((other) => (
              <button
                key={other.org_id}
                type="button"
                className={styles.orgPill}
                data-current={other.org_slug === membership.org_slug || undefined}
                onClick={() => void navigate(`/${other.org_slug}`)}
              >
                {other.org_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Plain words for the role, because "admin" alone does not say admin of what —
 * and in a two-level system (C3) that is the whole question.
 */
function describeRole(membership: Membership): string {
  if (membership.role === "owner") return "the owner";
  if (membership.role === "admin") {
    return membership.unit_name ? `an admin of ${membership.unit_name}` : "an organisation admin";
  }
  return membership.unit_name ? `a member of ${membership.unit_name}` : "a member";
}
