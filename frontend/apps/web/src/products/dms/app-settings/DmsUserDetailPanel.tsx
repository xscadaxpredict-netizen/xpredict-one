/**
 * A person on DMS settings -> Users, opened beside the list (the owner,
 * 2026-11-24): the Admin panel's person panel, with ONE tab, Basic Info.
 *
 * The same shape as every side panel (`RecordPanel.module.css`): header with
 * the badge, name, email and the row's own ⋮ (`DmsUserActions`), the tab row,
 * then the facts, which are DMS's: status, role in DMS and territory, then
 * first name, last name and email.
 */

import { useState, type ReactNode } from "react";
import { DetailPanel } from "@xpredict/ui";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  MailIcon,
  MapPinIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react";

import panel from "../../../shell/admin/components/RecordPanel.module.css";
import styles from "../../../shell/admin/components/UserDetailPanel.module.css";
import type { AppUser } from "./api";
import { DmsUserActions, displayName } from "./DmsUserActions";

interface DmsUserDetailPanelProps {
  user: AppUser;
  onClose: () => void;
}

/** The Admin panel's status words and colours, for DMS's three states. */
const STATUS: Record<AppUser["status"], { label: string; look: string }> = {
  active: { label: "Active", look: "active" },
  pending: { label: "Invitation sent", look: "invited" },
  inactive: { label: "Inactive", look: "disabled" },
};

export function DmsUserDetailPanel({ user, onClose }: DmsUserDetailPanelProps) {
  const [statusError, setStatusError] = useState<string | null>(null);
  const name = displayName(user);

  return (
    <DetailPanel
      label={name}
      onClose={onClose}
      header={
        <>
          <span className={panel.badge} aria-hidden="true">
            {initials(user)}
          </span>
          <div className={panel.heading}>
            <h2 className={panel.name}>{name}</h2>
            <p className={panel.description}>{user.email}</p>
          </div>
          <DmsUserActions user={user} onRemoved={onClose} onStatusError={setStatusError} />
        </>
      }
    >
      {/* ONE TAB, Basic Info (the owner's choice); more arrive as DMS needs them. */}
      <div className={panel.tabs} role="tablist" aria-label={`${name} details`}>
        <button
          type="button"
          role="tab"
          id="dms-user-tab-info"
          aria-selected="true"
          aria-controls="dms-user-panel-info"
          className={panel.tab}
        >
          Basic Info
        </button>
      </div>

      <div
        role="tabpanel"
        id="dms-user-panel-info"
        aria-labelledby="dms-user-tab-info"
        className={panel.panel}
      >
        <div className={panel.scroll}>
          {statusError && (
            <p className={styles.error} role="alert">
              {statusError}
            </p>
          )}
          <BasicInfo user={user} />
        </div>
      </div>
    </DetailPanel>
  );
}

function BasicInfo({ user }: { user: AppUser }) {
  const [open, setOpen] = useState(true);
  const status = STATUS[user.status];

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeading}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls="dms-user-basic-info"
          onClick={() => setOpen((shown) => !shown)}
        >
          <ChevronDownIcon size={16} aria-hidden="true" className={styles.chevron} />
          Basic Information
        </button>
      </h3>

      {open && (
        <dl id="dms-user-basic-info" className={styles.facts}>
          <Fact icon={<CircleCheckIcon size={18} />} label="Status">
            <span className={styles.status} data-status={status.look}>
              {status.label}
            </span>
            {user.status === "inactive" && user.access_status === "active" && (
              // DMS is on, but their whole account is off -- the Admin panel's
              // Deactivate, which DMS's Activate cannot undo.
              <span className={styles.note}>Their account is deactivated in the Admin panel.</span>
            )}
          </Fact>

          <Fact icon={<ShieldIcon size={18} />} label="Role in DMS">
            <span className={styles.role}>{user.is_owner ? "Owner" : (user.role?.name ?? "—")}</span>
          </Fact>

          <Fact icon={<MapPinIcon size={18} />} label="Territory">
            {user.is_owner ? (
              <span>All</span>
            ) : user.territories.length > 0 ? (
              <span>{user.territories.join(", ")}</span>
            ) : (
              <>
                <span className={styles.unset}>—</span>
                {user.status === "pending" && (
                  <span className={styles.note}>Placed when they join.</span>
                )}
              </>
            )}
          </Fact>

          <Fact icon={<UserRoundIcon size={18} />} label="First name">
            <Value text={user.first_name} />
          </Fact>

          <Fact icon={<UserRoundIcon size={18} />} label="Last name">
            <Value text={user.last_name} />
          </Fact>

          <Fact icon={<MailIcon size={18} />} label="Email">
            <Value text={user.email} />
          </Fact>
        </dl>
      )}
    </section>
  );
}

interface FactProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function Fact({ icon, label, children }: FactProps) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>
        <span className={styles.factIcon} aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  );
}

function Value({ text }: { text: string | null | undefined }) {
  return text ? <span>{text}</span> : <span className={styles.unset}>—</span>;
}

export function initials(user: Pick<AppUser, "first_name" | "last_name" | "email">): string {
  const letters = [user.first_name, user.last_name]
    .map((part) => part.trim()[0])
    .filter((letter): letter is string => Boolean(letter));
  return (letters.length > 0 ? letters.join("") : user.email.slice(0, 2)).toUpperCase();
}
