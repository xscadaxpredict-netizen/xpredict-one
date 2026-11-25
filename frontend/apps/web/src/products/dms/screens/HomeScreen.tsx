/**
 * DMS -> HOME (the owner, 2026-11-25; was "Overview" -> Welcome Hub): one page
 * with two tabs, each its own address.
 *
 *   Dashboard        `/dms/home`                   today's dashboard, nothing else
 *   Getting Started  `/dms/home/getting-started`   the welcome, how DMS works, your modules
 *
 * Drawn in the shared list format (`listPageStyles`): title, then the tab row.
 * Designed on the canvas https://claude.ai/artifact/Ds1vv6F1WWwyUu6oKKUhim.
 * The permission list gives each tab its own permission later
 * (`dms.dashboard.view`, `dms.welcome.view`); today both show to everybody
 * who opens DMS, as the Welcome Hub did.
 */

import { Link } from "react-router-dom";
import { listPageStyles as listStyles } from "@xpredict/ui";

import { useShellContext } from "../../../shell/context";
import { ConsolidatedDashboard } from "./ConsolidatedDashboard";
import { GettingStarted } from "./GettingStarted";
import styles from "./HomeScreen.module.css";

export type HomeTab = "dashboard" | "getting-started";

const TABS: { tab: HomeTab; label: string; path: string }[] = [
  { tab: "dashboard", label: "Dashboard", path: "home" },
  { tab: "getting-started", label: "Getting Started", path: "home/getting-started" },
];

export function HomeScreen({ tab }: { tab: HomeTab }) {
  const { membership } = useShellContext();
  const basePath = `/${membership.org_slug}/dms`;

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Home</h1>
      </div>

      <div className={listStyles.tabs} role="tablist" aria-label="Home">
        {TABS.map((item) => (
          <Link
            key={item.tab}
            to={`${basePath}/${item.path}`}
            role="tab"
            aria-selected={tab === item.tab}
            className={listStyles.tab}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab === "dashboard" ? "Dashboard" : "Getting Started"} className={styles.body}>
        {tab === "dashboard" ? <ConsolidatedDashboard /> : <GettingStarted />}
      </div>
    </div>
  );
}
