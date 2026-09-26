/**
 * The bar across the top of every signed-in page.
 *
 * Holds only what is true everywhere: the brand, the app launcher, which
 * organisation you are in, and your account. Anything that belongs to one
 * screen belongs on that screen.
 */

import type { Me, Membership } from "../api/auth";
import type { AppDefinition } from "../navigation";
import { AppLauncher } from "./AppLauncher";
import { MobileNav } from "./MobileNav";
import { OrgSwitcher } from "./OrgSwitcher";
import { UserMenu } from "./UserMenu";
import styles from "./Topbar.module.css";

interface TopbarProps {
  me: Me;
  /** The membership for the organisation in the URL — the apps hang off it. */
  membership: Membership;
  /**
   * The app currently open, or undefined on the launcher.
   *
   * The whole definition rather than its key and name separately, because the
   * mobile drawer renders that app's navigation and needs the nav groups too.
   */
  app: AppDefinition | undefined;
}

export function Topbar({ me, membership, app }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {/* Phone only. The sidebar has nowhere to live at this width, so this
            is the only way to reach another module. */}
        {app && <MobileNav app={app} orgSlug={membership.org_slug} />}

        {/*
          No app open means this IS the launcher, and a button that opens a
          list of apps on the screen already listing them is furniture. It
          appears as soon as you are inside an app, which is where switching
          is actually the question.
        */}
        {app && <AppLauncher membership={membership} currentAppKey={app.key} />}

        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            X
          </span>
          <span className={styles.brandName}>Xpredict One</span>
          {app && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <span className={styles.appName}>{app.name}</span>
            </>
          )}
        </div>
      </div>

      <div className={styles.right}>
        <OrgSwitcher
          memberships={me.memberships}
          currentOrgSlug={membership.org_slug}
          currentAppKey={app?.key}
        />
        <UserMenu me={me} />
      </div>
    </header>
  );
}
