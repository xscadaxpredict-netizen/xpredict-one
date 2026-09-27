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

  const { userId } = useParams<{ userId: string }>();

  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/admin/users`;

  /*
   * TWO INDEPENDENT THINGS, and keeping them independent is the point.
   *
   * `filtered` is a view of the LIST — it answers "which rows do I draw".
   * `selected` is what the URL says is OPEN, and it is looked up in the FULL
   * list on purpose: a search is not a reason to close the record somebody is
   * reading. Tangling the two is how typing in the search box used to delete
   * the panel while the address bar still named the person in it.
   */
  const filtered = users?.filter((user) => matches(user.first_name, user.last_name, user.email, query));
  const selected = userId ? users?.find((user) => user.id === userId) : undefined;

  /*
   * `unit_id`, not `unit_name` — the same field the invite dialog asks.
   *
   * These were two different fields answering one question, and they agreed
   * only by luck: a membership with a name but no id, or an id but no name,
   * would have made this screen and that dialog disagree about who the person
   * is. The id is the one that identifies; the name is a label.
   */
  const isOrgAdmin = membership.unit_id === null;

  const showsOtherDealersPeople = isOrgAdmin && (users?.some((user) => user.unit_name !== null) ?? false);

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
            {isOrgAdmin ? (
              <>
                Everyone in {membership.org_name}. People belong to the organisation; only
                DMS scopes them to a dealer.
              </>
            ) : (
              <>
                People at {membership.unit_name}. You can invite someone to this dealer and
                give them DMS; the rest of {membership.org_name} is managed by an
                organisation admin.
              </>
            )}
          </p>
        </div>

        <InviteUserDialog membership={membership} />
      </header>

      {/*
        C3's override warning, and the thing that makes one screen serve two
        jobs honestly: a dealer admin managing their own people is the normal
        path and sees nothing; an organisation admin reaching into a dealer's
        people is doing something recorded, and is told so before they do it.
      */}
      {showsOtherDealersPeople && (
        <p className={styles.auditNotice} role="note">
          <strong>You are acting as an organisation admin.</strong> Dealers normally manage
          their own people. Anything you change on a dealer&rsquo;s user here is recorded in
          the audit log as an override.
        </p>
      )}

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

      {/*
        The list and the open record sit side by side, and the panel is NOT
        inside the "are there rows?" branch. It used to be, which meant the
        search box silently governed the panel too.
      */}
      <div className={styles.layout} data-detail={selected ? true : undefined}>
        <div className={styles.listArea}>
          {isPending && <TableSkeleton label="users" columns={[260, 150, 180, "grow"]} rows={5} />}

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
             * Deliberately offers no "Invite user" button. The data exists —
             * the filter is the problem, so the exit is to widen it. Offering
             * to create a record here is how somebody ends up inviting a
             * colleague who was already on the list two letters away.
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
            <UserTable
              users={filtered}
              basePath={basePath}
              selectedId={selected?.id}
              onSelect={(id) => void navigate(`${basePath}/${id}`)}
            />
          )}

          {/*
            A URL naming somebody who is not in the list: a stale link, or a
            person removed since it was sent. Said plainly rather than silently
            dropping the panel, which would look like the link had worked.
          */}
          {userId && users && !selected && (
            <p className={styles.missing} role="status">
              That person is no longer in {membership.org_name}.{" "}
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => void navigate(basePath)}
              >
                Back to all users
              </button>
            </p>
          )}
        </div>

        {selected && (
          /*
           * `key` is what makes this a NEW panel per person rather than the
           * same one handed different props. Without it React keeps the
           * instance alive, and everything it remembers comes with it — a
           * "resend invitation" that has already succeeded stays disabled for
           * the next person, and one person's failed deactivation shows up on
           * the next one's panel.
           */
          <UserDetailPanel
            key={selected.id}
            user={selected}
            membership={membership}
            onClose={() => void navigate(basePath)}
          />
        )}
      </div>

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
