/**
 * One application, opened beside the Applications list (C78) — the way Zoho
 * One shows an app: its name and description at the top with its ⋮, then
 * tabs.
 *
 * TWO TABS. "Members" works: everyone who can open the app, with their role
 * and where it applies, and a search over them. "Conditional Assignment" is
 * planned and drawn greyed out, with `aria-disabled` rather than `disabled`
 * so a keyboard still reaches it and its "coming later" hint is readable.
 *
 * EACH TAB HAS ITS OWN PERMISSION (C79, the owner's final list): Members needs
 * `admin.application.view_users` -- the same one its endpoint checks -- and
 * Conditional Assignment `admin.application.view_conditional_assignment`.
 * Things inside an opened record are special actions on its leaf, not
 * sections, so these are `can()` checks. A tab the person lacks is not drawn,
 * and the members are never asked for.
 *
 * `key` it by the app's code where it is rendered, so opening another app
 * mounts a fresh panel and the previous one's search does not carry over.
 */

import { asProblem } from "@xpredict/api-client";
import { DetailPanel, ErrorState } from "@xpredict/ui";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { useAccess } from "../../access";
import { findApp } from "../../navigation";
import type { Application, ApplicationMember } from "../api/applications";
import { useApplicationMembers } from "../hooks/useApplications";
import { ApplicationActions } from "./ApplicationActions";
import styles from "./RecordPanel.module.css";

interface ApplicationDetailPanelProps {
  app: Application;
  onClose: () => void;
}

export function ApplicationDetailPanel({ app, onClose }: ApplicationDetailPanelProps) {
  const definition = findApp(app.code);
  const access = useAccess();
  const canSeeMembers = access.can("admin.application.view_users");
  const canSeeConditional = access.can("admin.application.view_conditional_assignment");

  return (
    <DetailPanel
      label={app.name}
      onClose={onClose}
      header={
        <>
          <span className={styles.badge} aria-hidden="true">
            {definition?.initials ?? app.name.slice(0, 2).toUpperCase()}
          </span>
          <div className={styles.heading}>
            <h2 className={styles.name}>{app.name}</h2>
            {definition && <p className={styles.description}>{definition.description}</p>}
          </div>
          <ApplicationActions app={app} />
        </>
      }
    >
      {(canSeeMembers || canSeeConditional) && (
        <div className={styles.tabs} role="tablist" aria-label={`${app.name} details`}>
          {canSeeMembers && (
            <button
              type="button"
              role="tab"
              id="application-tab-members"
              aria-selected="true"
              aria-controls="application-panel-members"
              className={styles.tab}
            >
              Members
            </button>
          )}
          {canSeeConditional && (
            <button
              type="button"
              role="tab"
              aria-selected="false"
              aria-disabled="true"
              title="Coming later"
              className={styles.tab}
            >
              Conditional Assignment
            </button>
          )}
        </div>
      )}

      {canSeeMembers && (
        <div
          role="tabpanel"
          id="application-panel-members"
          aria-labelledby="application-tab-members"
          className={styles.panel}
        >
          {app.active ? (
            <Members app={app} />
          ) : (
            <p className={styles.note}>
              Your organization doesn&rsquo;t subscribe to {app.name}, so nobody can open it.
            </p>
          )}
        </div>
      )}
    </DetailPanel>
  );
}

function Members({ app }: { app: Application }) {
  const { data: people, isPending, isError, error, refetch } = useApplicationMembers(app.code);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = (people ?? []).filter(
    (person) =>
      needle === "" ||
      person.name.toLowerCase().includes(needle) ||
      person.email.toLowerCase().includes(needle),
  );

  return (
    <>
      <div className={styles.search}>
        <SearchIcon size={16} className={styles.searchIcon} aria-hidden="true" />
        <label htmlFor="application-members-search" className={styles.visuallyHidden}>
          Search {app.name} members
        </label>
        <input
          id="application-members-search"
          type="search"
          placeholder="Search users"
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {isPending && (
        <p className={styles.note} role="status">
          Loading…
        </p>
      )}

      {isError && (
        <ErrorState
          title={`Could not load ${app.name}'s members`}
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {people && (
        <>
          <p className={styles.count}>
            {people.length === 1 ? "1 member" : `${String(people.length)} members`}
          </p>
          {/*
            THE ONLY PART THAT SCROLLS. The app's header, the tabs, the search
            and the count stay where they are; a long list scrolls in here.
          */}
          <div className={styles.scroll}>
            {shown.length > 0 ? (
              <ul className={styles.people} aria-label={`${app.name} members`}>
                {shown.map((person) => (
                  <MemberRow key={person.id} person={person} />
                ))}
              </ul>
            ) : (
              <p className={styles.note}>
                {needle ? `Nobody matches “${query.trim()}”.` : `Nobody can open ${app.name} yet.`}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

function MemberRow({ person }: { person: ApplicationMember }) {
  const where = [person.role, person.places.join(", ")].filter(Boolean).join(", ");

  return (
    <li className={styles.person}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(person.name)}
      </span>
      <div className={styles.personText}>
        <span className={styles.personName}>
          {person.name}
          {person.is_owner && <span className={styles.ownerTag}>Owner</span>}
        </span>
        {person.name !== person.email && <span className={styles.email}>{person.email}</span>}
        {where && <span className={styles.where}>{where}</span>}
        <MemberActions person={person} />
      </div>
    </li>
  );
}

const MEMBER_ACTIONS = ["Edit", "Disable", "Unassign"] as const;

/**
 * Edit | Disable | Unassign under each person — DRAWN ONLY, all three greyed
 * out with no behaviour yet (the owner, 2026-11-17). `aria-disabled` rather
 * than `disabled`, so a keyboard still reaches them and "Coming later" can be
 * read; each is named for its person, so a screen reader hears whose it is.
 */
function MemberActions({ person }: { person: ApplicationMember }) {
  return (
    <div className={styles.memberActions}>
      {MEMBER_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          className={styles.memberAction}
          aria-disabled="true"
          aria-label={`${action} ${person.name}`}
          title="Coming later"
        >
          {action}
        </button>
      ))}
    </div>
  );
}

/** "Asha Rao" -> "AR"; an address -> its first two letters. */
function initials(name: string): string {
  const [first, second] = name.split(/\s+/).filter(Boolean);
  if (first && second) return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
