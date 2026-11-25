/**
 * DMS settings -> Security & Controls -> POSITION AND SHARING (the owner,
 * 2026-11-25; was "Position Hierarchy"): one sub-module, two tabs, each its
 * own address.
 *
 *   Position  `/dms/settings/position-sharing`          the reporting chart (C72, C77):
 *                                                       whose records a person sees
 *   Sharing   `/dms/settings/position-sharing/sharing`  sharing rules (C72 piece 6, Q58)
 *
 * The page and its tabs first; each tab's content is built in its own step
 * (Position: canvas https://claude.ai/artifact/6LBDCzijEcJV44LHAFu6mr).
 */

import { Link } from "react-router-dom";
import { listPageStyles as listStyles } from "@xpredict/ui";

import { useShellContext } from "../../../shell/context";

export type PositionSharingTab = "position" | "sharing";

const TABS: { tab: PositionSharingTab; label: string; path: string }[] = [
  { tab: "position", label: "Position", path: "" },
  { tab: "sharing", label: "Sharing", path: "/sharing" },
];

export function PositionSharingScreen({ tab }: { tab: PositionSharingTab }) {
  const { membership } = useShellContext();
  const basePath = `/${membership.org_slug}/dms/settings/position-sharing`;

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Position and Sharing</h1>
      </div>

      <div className={listStyles.tabs} role="tablist" aria-label="Position and Sharing">
        {TABS.map((item) => (
          <Link
            key={item.tab}
            to={`${basePath}${item.path}`}
            role="tab"
            aria-selected={tab === item.tab}
            className={listStyles.tab}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab === "position" ? "Position" : "Sharing"}>
        <p className={listStyles.empty}>
          {tab === "position"
            ? "The position chart is being built: who reports to whom in DMS, and so whose records each person sees."
            : "Sharing is being built: which records are shared beyond the position chart."}
        </p>
      </div>
    </div>
  );
}
