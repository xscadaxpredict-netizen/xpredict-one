/**
 * Admin panel -> Organization -> Profile (C78).
 *
 * Tabs across the top, Zoho-style. ONLY "Organization Info" works today; the
 * others are planned and drawn greyed out so the shape of the page is
 * visible, with `aria-disabled` rather than `disabled` so a keyboard still
 * reaches them and their "coming later" hint is readable.
 *
 * READ-ONLY, and only what the platform already stores (the owner,
 * 2026-11-17): name, web address, owner, when it was created and whether its
 * workspace is ready. No logo and no Edit until there is something to edit.
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState, InfoHint } from "@xpredict/ui";
import { CalendarIcon, DatabaseIcon, UserRoundIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { OrganizationProfile } from "../api/organization";
import { useOrganizationProfile } from "../hooks/useOrganizationProfile";
import styles from "./ProfileScreen.module.css";

/** The tabs Zoho has here, renamed for a dealership business. Placeholders. */
const LATER_TABS = ["Work Locations", "Designations", "Business Hours", "Holidays"];

export function ProfileScreen() {
  const { data: profile, isPending, isError, error, refetch } = useOrganizationProfile();

  return (
    <div className={styles.page}>
      <div className={styles.tabs} role="tablist" aria-label="Profile">
        <button
          type="button"
          role="tab"
          id="profile-tab-info"
          aria-selected="true"
          aria-controls="profile-panel-info"
          className={styles.tab}
        >
          Organization Info
        </button>
        {LATER_TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected="false"
            aria-disabled="true"
            title="Coming later"
            className={styles.tab}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="profile-panel-info"
        aria-labelledby="profile-tab-info"
        className={styles.panel}
      >
        {isPending && (
          <p className={styles.loading} role="status">
            Loading…
          </p>
        )}

        {isError && (
          <ErrorState
            title="Could not load the organization's profile"
            code={asProblem(error).code}
            traceId={asProblem(error).trace_id}
            onRetry={() => void refetch()}
          />
        )}

        {profile && <OrganizationInfo profile={profile} />}
      </div>
    </div>
  );
}

function OrganizationInfo({ profile }: { profile: OrganizationProfile }) {
  const address = `${window.location.host}/${profile.slug}`;

  return (
    <>
      <section className={styles.header}>
        <h1 className={styles.name}>{profile.name}</h1>
        <div className={styles.address}>
          <span>{address}</span>
          <InfoHint label="About the web address">
            Your organization&rsquo;s web address. It was set when the organization was
            created and can&rsquo;t be changed.
          </InfoHint>
        </div>
      </section>

      <section className={styles.facts} aria-label="Organization details">
        <Fact icon={<UserRoundIcon size={18} />} label="Owner">
          {profile.owner ? (
            <>
              <span className={styles.value}>{profile.owner.name}</span>
              {profile.owner.name !== profile.owner.email && (
                <span className={styles.sub}>{profile.owner.email}</span>
              )}
            </>
          ) : (
            <span className={styles.unset}>Not set</span>
          )}
        </Fact>

        <Fact icon={<CalendarIcon size={18} />} label="Created">
          <span className={styles.value}>{formatDate(profile.created_at)}</span>
        </Fact>

        <Fact icon={<DatabaseIcon size={18} />} label="Workspace">
          {profile.is_ready ? (
            <>
              <span className={styles.value}>Ready</span>
              <span className={styles.sub}>
                Your organization&rsquo;s data is set up and working.
              </span>
            </>
          ) : (
            <>
              <span className={styles.value}>Being set up</span>
              <span className={styles.sub}>This normally takes a few seconds.</span>
            </>
          )}
        </Fact>
      </section>
    </>
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
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.factBody}>
        <span className={styles.label}>{label}</span>
        {children}
      </div>
    </div>
  );
}

/** "21 October 2026": a date, not a time — when it was set up is the fact. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
