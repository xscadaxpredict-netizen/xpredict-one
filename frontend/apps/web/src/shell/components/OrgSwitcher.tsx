/**
 * Which organisation am I in.
 *
 * With ONE membership this renders plain text, not a dropdown. C13 decided
 * against an organisation picker screen for exactly this reason: a choice with
 * one option is not a choice. Same logic applies in the topbar.
 *
 * With several, it becomes a menu — the only way a multi-org user reaches the
 * others, since login always lands on the first.
 *
 * SWITCHING IS A NAVIGATION, NOT A SETTING. The organisation lives in the URL
 * (`/:orgSlug/...`), so changing org means going to a different address. It is
 * deliberately not stored anywhere: a "current org" kept in a store would
 * disagree with the URL the moment someone used the back button or a bookmark,
 * and the loser of that disagreement would be showing the wrong customer's data.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";

import type { Membership } from "../api/auth";
import styles from "./OrgSwitcher.module.css";

interface OrgSwitcherProps {
  memberships: Membership[];
  currentOrgSlug: string;
  /** The app to stay in when switching, so the user does not lose their place. */
  currentAppKey: string | undefined;
}

export function OrgSwitcher({ memberships, currentOrgSlug, currentAppKey }: OrgSwitcherProps) {
  const navigate = useNavigate();
  const current = memberships.find((m) => m.org_slug === currentOrgSlug);
  const label = current?.org_name ?? currentOrgSlug;

  if (memberships.length < 2) {
    return (
      <div className={styles.static}>
        <span className={styles.orgName}>{label}</span>
        {current?.unit_name && <span className={styles.unit}>{current.unit_name}</span>}
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger}>
        <span className={styles.orgName}>{label}</span>
        {/* The unit shows here as well as in the single-org case. In DMS it is
            which dealer you are acting as, so dropping it for multi-org users
            would hide the more important half of "where am I". */}
        {current?.unit_name && <span className={styles.unit}>{current.unit_name}</span>}
        <ChevronIcon />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8} align="start">
          <DropdownMenu.Label className={styles.label}>Organisations</DropdownMenu.Label>

          {memberships.map((membership) => (
            <DropdownMenu.Item
              key={membership.org_id}
              className={styles.item}
              data-current={membership.org_slug === currentOrgSlug || undefined}
              onSelect={() =>
                void navigate(`/${membership.org_slug}/${currentAppKey ?? "dms"}`)
              }
            >
              <span className={styles.itemName}>{membership.org_name}</span>
              <span className={styles.itemMeta}>
                {membership.unit_name ? `${membership.role} · ${membership.unit_name}` : membership.role}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M3 4.75 6 7.75l3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
