/**
 * The bar across the top of every signed-in page.
 *
 * Holds only what is true everywhere: the brand, the app launcher, which
 * organisation you are in, and your account. Anything that belongs to one
 * screen belongs on that screen.
 */

import type { Me } from "../api/auth";
import { AppLauncher } from "./AppLauncher";
import { OrgSwitcher } from "./OrgSwitcher";
import { UserMenu } from "./UserMenu";
import styles from "./Topbar.module.css";

interface TopbarProps {
  me: Me;
  orgSlug: string;
  currentAppKey: string | undefined;
  /** The name of the app currently open, shown next to the brand. */
  currentAppName: string | undefined;
}

export function Topbar({ me, orgSlug, currentAppKey, currentAppName }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <AppLauncher orgSlug={orgSlug} currentAppKey={currentAppKey} />

        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            X
          </span>
          <span className={styles.brandName}>Xpredict One</span>
          {currentAppName && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <span className={styles.appName}>{currentAppName}</span>
            </>
          )}
        </div>
      </div>

      <div className={styles.right}>
        <OrgSwitcher
          memberships={me.memberships}
          currentOrgSlug={orgSlug}
          currentAppKey={currentAppKey}
        />
        <UserMenu me={me} />
      </div>
    </header>
  );
}
