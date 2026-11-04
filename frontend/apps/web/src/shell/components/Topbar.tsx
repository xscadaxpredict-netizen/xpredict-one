/**
 * The bar across the top of every signed-in page.
 *
 * Holds only what is true everywhere: which app you are in, which
 * organisation, your account, and the way to every other app. Anything that
 * belongs to one screen belongs on that screen.
 *
 * THE SAME BAR FOR EVERY APP. DMS, CRM, Administration and whatever comes next
 * get this exact component; only the name and icon in the brand block change,
 * and those come from the app's catalogue entry. An app never ships its own
 * topbar.
 */

import { Link } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { SearchIcon, SettingsIcon } from "lucide-react";

import type { Me, Membership } from "../api/auth";
import type { AppDefinition } from "../navigation";
import { useUiStore } from "../../stores/uiStore";
import { AppIcon } from "./AppIcon";
import { AppsPanel } from "./AppsPanel";
import { MobileNav } from "./MobileNav";
import { NotificationMenu } from "./NotificationMenu";
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
  /*
   * The brand block is exactly as wide as the sidebar below it, so the two
   * read as one dark column — which means it has to follow the sidebar when
   * it collapses. On the launcher there is no sidebar, and it keeps its full
   * width so the name still fits.
   */
  const sidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const collapsed = app !== undefined && sidebarCollapsed;

  const home = app ? `/${membership.org_slug}/${app.key}` : `/${membership.org_slug}`;

  return (
    <header className={styles.topbar}>
      <Link
        to={home}
        className={styles.brand}
        data-collapsed={collapsed || undefined}
        // Always set, not only when collapsed: the visible name is also hidden
        // on a phone, by CSS, and a link with no text has no name at all.
        aria-label={app ? app.name : "Xpredict One"}
      >
        {app ? (
          <span className={styles.brandIcon}>
            <AppIcon app={app.key} size={24} />
          </span>
        ) : (
          <span className={styles.mark} aria-hidden="true">
            X
          </span>
        )}
        <span className={styles.brandName}>{app ? app.name : "Xpredict One"}</span>
      </Link>

      <div className={styles.bar}>
        {/* Phone only. The sidebar has nowhere to live at this width, so this
            is the only way to reach another module. */}
        {app && <MobileNav app={app} orgSlug={membership.org_slug} />}

        <div className={styles.searchContainer}>
          <SearchIcon size={16} className={styles.searchIcon} aria-hidden="true" />
          <label htmlFor="topbar-search" className={styles.visuallyHidden}>
            Search
          </label>
          <input
            id="topbar-search"
            type="search"
            placeholder="Search…"
            className={styles.searchInput}
          />
        </div>

        <div className={styles.spacer} />

        <OrgSwitcher
          memberships={me.memberships}
          currentOrgSlug={membership.org_slug}
          currentAppKey={app?.key}
        />

        <span className={styles.divider} aria-hidden="true" />

        <div className={styles.actions}>
          <NotificationMenu orgSlug={membership.org_slug} />
          <SettingsButton />
          <UserMenu me={me} membership={membership} />
          {/*
            No app open means this IS the launcher, and a button that opens a
            list of apps on the screen already listing them is furniture. It
            appears as soon as you are inside an app, which is where switching
            is actually the question.
          */}
          {app && <AppsPanel membership={membership} currentAppKey={app.key} />}
        </div>
      </div>
    </header>
  );
}

/**
 * A placeholder: there are no settings to open yet. It is here so the bar's
 * layout is settled before they exist, and it says so — `aria-disabled` keeps
 * it reachable by keyboard and its tooltip readable, which `disabled` would not.
 */
function SettingsButton() {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Settings"
            aria-disabled="true"
          >
            <SettingsIcon size={18} aria-hidden="true" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={styles.tooltip} side="bottom" sideOffset={6}>
            Settings
            <Tooltip.Arrow className={styles.tooltipArrow} width={10} height={5} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
