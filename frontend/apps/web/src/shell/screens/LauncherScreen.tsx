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
 * There is no organisation switcher on this screen. One was built here and
 * removed: the topbar already carries it, on every screen including this one,
 * and a second copy underneath the apps is a second thing to keep in step for
 * no gain.
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
  const { membership } = useShellContext();
  const apps = visibleApps(membership);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Your apps</h1>
        <p className={styles.subtitle}>
          In <strong>{membership.org_name}</strong> · you are {describeRole(membership)}
        </p>
      </div>

      {membership.unit_closed ? (
        /*
         * THEIR DEALERSHIP HAS BEEN CLOSED (C63, answering Q21).
         *
         * FIRST, BEFORE THE READINESS CHECK, because it is the more specific
         * answer: an organisation whose workspace is fine and whose branch has
         * shut should say so, not say it is still being set up.
         *
         * AND BEFORE THE TILES, not instead of enabling them. Every app comes
         * back inaccessible, so `visibleApps` would render whatever the
         * organisation is subscribed to as DISABLED tiles — correct by C16 and
         * useless here, because a greyed-out tile invites clicking and explains
         * nothing. The person did not lose access to DMS; their branch closed.
         *
         * THIS IS THE SCREEN C58 BUILT THE OTHER HALF OF. Somebody removed from
         * their only organisation signs in with zero memberships and is told
         * so. This person has a membership and cannot use it, and before C63
         * there was nothing to tell them apart — the membership would simply
         * have been dropped, and they would have been shown a sentence saying
         * their access was removed, which is not what happened.
         */
        <p className={styles.empty} aria-live="polite">
          <strong>{membership.unit_name}</strong> has been closed, so you cannot open
          anything in <strong>{membership.org_name}</strong> at the moment. Nothing has
          been deleted and your access returns if the dealership reopens — contact an
          administrator of {membership.org_name} if you think this is a mistake.
        </p>
      ) : !membership.is_ready ? (
        /*
         * THE WORKSPACE IS NOT THERE YET (C50). Each organisation gets its own
         * database, created by a task after signup commits — so for a few
         * seconds the account is real and the workspace is not, and if
         * provisioning failed for good it stays that way.
         *
         * Opening an app in that state means the first business query hits a
         * database that does not exist. Today that is harmless, because no
         * tenant app has models and nothing queries anything; the moment DMS
         * has its first model it is a 500 on every page, and the owner has no
         * idea why a product they just paid for is broken.
         *
         * So the tiles are not rendered at all rather than shown disabled.
         * A disabled tile invites clicking and explains nothing; this says
         * what is happening.
         */
        <p className={styles.empty} aria-live="polite">
          <strong>{membership.org_name}</strong> is still being set up. Its workspace is
          being prepared and your apps will appear here once it is ready — this normally
          takes a few seconds. If it has been longer than that, contact support and quote{" "}
          <strong>{membership.org_slug}</strong>.
        </p>
      ) : apps.length === 0 ? (
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

    </div>
  );
}

/**
 * Plain words for the role, because "admin" alone does not say admin of what —
 * and in a two-level system (C3) that is the whole question.
 *
 * IT CANNOT READ STANDING ALONE, which is what it used to do (C40). Standing
 * `admin` now always means the whole organisation: a membership above `member`
 * must have `unit_id` null and the database refuses anything else, so the old
 * `admin` + unit_name branch described a row that cannot exist.
 *
 * A dealer admin is `member` with a dealership, made an admin by holding the
 * DMS System administrator role. Read by standing alone they came out as "a
 * member of Bangalore — Whitefield", which is the exact "shows them as Member"
 * bug the owner reported in session 5, surfacing here because PR #12 fixed the
 * Users list and the dialogs and nothing told it this file said it too.
 *
 * So administration is read where it actually lives: the Administration app
 * being accessible, which is true whether it came from standing or a role.
 */
function describeRole(membership: Membership): string {
  if (membership.role === "owner") return "the owner";
  if (membership.role === "admin") return "an organisation admin";

  const administers = membership.apps.some((app) => app.key === "admin" && app.accessible);
  if (administers) {
    return membership.unit_name ? `an admin of ${membership.unit_name}` : "an administrator";
  }

  return membership.unit_name ? `a member of ${membership.unit_name}` : "a member";
}
