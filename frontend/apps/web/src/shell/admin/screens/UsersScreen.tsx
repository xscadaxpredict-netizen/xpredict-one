/**
 * Administration → Users. Everyone in the organisation, in one list.
 *
 * FOUR STATES, because rule 4 of the working agreement says a list screen is
 * not done without them — and because each is a different screen rather than
 * a variation:
 *
 *   loading  — a skeleton the shape of the table, not a spinner
 *   error    — driven by the backend's `code`, with a retry
 *   empty    — impossible today but written anyway, see below
 *   filtered — "no results" is NOT the same screen as "nothing exists"
 *
 * The empty state is genuinely unreachable right now: an organisation always
 * has at least its owner (C14), so a zero-length list would mean the request
 * matched the wrong organisation. It is written because "impossible" states
 * are the ones that ship as a blank white page.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, TableSkeleton } from "@xpredict/ui";

import { useShellContext } from "../../context";
import { InviteUserDialog } from "../components/InviteUserDialog";
import { UserDetailPanel } from "../components/UserDetailPanel";
import { UserTable } from "../components/UserTable";
import { useUsers } from "../hooks/useUsers";
import styles from "./UsersScreen.module.css";

export function UsersScreen() {
  const { membership } = useShellContext();
  const { data: users, isPending, isError, error, refetch } = useUsers();
  const [query, setQuery] = useState("");

  /*
   * The open person lives in the URL, not in state. Back closes the panel, a
   * link to one person can be pasted into a message, and a refresh keeps it
   * open — none of which a `useState` would give, and it would disagree with
   * the address bar the first time somebody pressed Back.
   */
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/admin/users`;

  const filtered = users?.filter((user) => matches(user.first_name, user.last_name, user.email, query));

  /*
   * Looked up in the list that is already loaded rather than fetched again.
   * There is no detail endpoint yet, and while the whole list is in the cache
   * a second request would ask for something it already has.
   */
  const selected = userId ? users?.find((user) => user.id === userId) : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Users</h1>
          <p className={styles.subtitle}>
            {/*
              Says the model out loud, because it is the thing people get
              wrong: a person belongs to the organisation, and DMS is the only
              app that narrows them to one dealer.
            */}
            Everyone in {membership.org_name}. People belong to the organisation; only DMS
            scopes them to a dealer.
          </p>
        </div>

        <InviteUserDialog membership={membership} />
      </header>

      {/* Hidden until there is something to search. A filter above an empty
          table is furniture, and above a skeleton it is a control that does
          nothing yet. */}
      {users && users.length > 0 && (
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span className={styles.srOnly}>Search users</span>
            <SearchIcon />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <p className={styles.count} aria-live="polite">
            {filtered?.length === users.length
              ? `${String(users.length)} people`
              : `${String(filtered?.length ?? 0)} of ${String(users.length)}`}
          </p>
        </div>
      )}

      {isPending && (
        <TableSkeleton label="users" columns={[260, 150, 180, "grow"]} rows={5} />
      )}

      {isError && (
        <ErrorState
          title="Could not load users"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {users && users.length === 0 && (
        <EmptyState
          title="No users yet"
          body="Invite someone and they will appear here once the invitation is sent."
        />
      )}

      {filtered && filtered.length === 0 && users && users.length > 0 && (
        /*
         * Deliberately offers no "Invite user" button. The data exists — the
         * filter is the problem, so the exit is to widen it. Offering to
         * create a record here is how somebody ends up inviting a colleague
         * who was already on the list two letters away.
         */
        <EmptyState
          title="No users match your search"
          body={`There are ${String(users.length)} people in this organisation.`}
          action={
            <button type="button" className={styles.clear} onClick={() => setQuery("")}>
              Clear search
            </button>
          }
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className={styles.layout} data-detail={selected ? true : undefined}>
          <UserTable
            users={filtered}
            basePath={basePath}
            selectedId={selected?.id}
            onSelect={(id) => void navigate(`${basePath}/${id}`)}
          />

          {selected && (
            <UserDetailPanel user={selected} onClose={() => void navigate(basePath)} />
          )}
        </div>
      )}

      {/*
        A URL naming somebody who is not in the list: a stale link, or a person
        removed since it was sent. Said plainly rather than silently dropping
        the panel, which would look like the link had worked.
      */}
      {userId && users && !selected && (
        <p className={styles.missing} role="status">
          That person is no longer in {membership.org_name}.{" "}
          <button type="button" className={styles.linkButton} onClick={() => void navigate(basePath)}>
            Back to all users
          </button>
        </p>
      )}
    </div>
  );
}

/** Case-insensitive match across the fields somebody would actually type. */
function matches(firstName: string, lastName: string, email: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return `${firstName} ${lastName} ${email}`.toLowerCase().includes(needle);
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.1 3.1" />
    </svg>
  );
}
