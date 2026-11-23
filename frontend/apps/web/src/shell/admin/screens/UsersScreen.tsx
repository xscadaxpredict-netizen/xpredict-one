/**
 * Admin panel → User Management → Users. Everyone in the organisation, in one
 * list, in the format every Admin panel list page shares (C78,
 * `ListPage.module.css`): title, then a toolbar with the filter on the left
 * and "Add user" on the right, then the list and the open person side by
 * side, filling the screen. The TOPBAR's box searches it ("Search users", by
 * name or email).
 *
 * THE FILTER (the owner, 2026-11-17): Active users (the default, as Zoho),
 * All users, Inactive users (switched off), Pending users (invited, not yet
 * joined) and Confirmed users (joined: active or inactive).
 *
 * FOUR STATES, because a list screen is not done without them — and each is a
 * different screen rather than a variation:
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
import { Link, useNavigate, useParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, InfoHint, TableSkeleton } from "@xpredict/ui";

import { usePageSearch } from "../../../stores/pageSearchStore";
import { useAccess } from "../../access";
import { useShellContext } from "../../context";
import type { OrgUser } from "../api/users";
import { InviteUserDialog } from "../components/InviteUserDialog";
import { ListFilter } from "../components/ListFilter";
import { UserDetailPanel } from "../components/UserDetailPanel";
import { UserTable } from "../components/UserTable";
import { useUsers } from "../hooks/useUsers";
import styles from "./ListPage.module.css";

type Filter = "active" | "all" | "inactive" | "pending" | "confirmed";

const FILTERS = [
  { value: "active", label: "Active users" },
  { value: "all", label: "All users" },
  { value: "inactive", label: "Inactive users" },
  { value: "pending", label: "Pending users" },
  { value: "confirmed", label: "Confirmed users" },
] as const;

const FILTER_WORD: Record<Filter, string> = {
  active: "active ",
  all: "",
  inactive: "inactive ",
  pending: "pending ",
  confirmed: "confirmed ",
};

function inFilter(user: OrgUser, filter: Filter): boolean {
  switch (filter) {
    case "active":
      return user.status === "active";
    case "inactive":
      return user.status === "disabled";
    case "pending":
      return user.status === "invited";
    case "confirmed":
      return user.status !== "invited";
    case "all":
      return true;
  }
}

export function UsersScreen() {
  const { membership } = useShellContext();
  const { data: users, isPending, isError, error, refetch } = useUsers();
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<Filter>("active");

  const { userId } = useParams<{ userId: string }>();

  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/admin/users`;

  /*
   * TWO INDEPENDENT THINGS, and keeping them independent is the point.
   *
   * `shown` is a view of the LIST — it answers "which rows do I draw".
   * `selected` is what the URL says is OPEN, and it is looked up in the FULL
   * list on purpose: a search or a filter is not a reason to close the record
   * somebody is reading. Tangling the two is how typing in the search box used
   * to delete the panel while the address bar still named the person in it.
   */
  const shown = users?.filter(
    (user) =>
      inFilter(user, filter) && matches(user.first_name, user.last_name, user.email, query),
  );
  const selected = userId ? users?.find((user) => user.id === userId) : undefined;

  /*
   * ORGANISATION-WIDE, which is what `unit_id === null` means — not "is an org
   * admin". Being unattached to a dealership is one fact, and administering
   * the organisation is another (C40); only somebody holding `admin.user.*`
   * reaches this screen at all, which is the route guard's doing, not this
   * line's.
   */
  const callerIsOrgWide = membership.unit_id === null;

  /*
   * ADD USER IS THE ORGANISATION-WIDE ADMINS' (C83): an invited person sits
   * nowhere, so the server refuses anybody narrower -- a dealer admin -- with
   * a 403. Not offering the button is the screen agreeing with it.
   *
   * ANY ADMIN PANEL ROLE IS ORGANISATION-WIDE (C89): the owner, an
   * Organization Admin, or somebody holding one of the organisation's own
   * roles -- their Administration grant sits at the root. A dealer admin holds
   * none (their administering is a DMS role), so `admin_role` is null for them.
   */
  const access = useAccess();
  const canAddUsers = membership.admin_role !== null && access.can("admin.user.create");

  const showsOtherDealersPeople =
    callerIsOrgWide && (users?.some((user) => user.unit_name !== null) ?? false);

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Users</h1>
        {/*
          It says the model out loud — a person belongs to the organisation,
          and DMS is the only app that narrows them to one dealer — and says a
          DIFFERENT thing to a dealer admin, because what they can do here is
          different (C23).
        */}
        <InfoHint label="About the Users screen">
          {callerIsOrgWide ? (
            <>
              Everyone in {membership.org_name}. People belong to the organisation; only DMS
              scopes them to a dealer.
            </>
          ) : (
            <>
              People at {membership.unit_name}. New people are added by an organisation admin;
              you can then manage their DMS here.
            </>
          )}
        </InfoHint>
      </div>

      {/*
        C3's override warning: a dealer admin managing their own people sees
        nothing; an organisation admin reaching into a dealer's people is doing
        something recorded, and is told so before they do it.
      */}
      {showsOtherDealersPeople && (
        <p className={styles.notice} role="note">
          <strong>You are acting as an organisation admin.</strong> Dealers normally manage their
          own people. Anything you change on a dealer&rsquo;s user here is recorded in the audit
          log as an override.
        </p>
      )}

      <div className={styles.toolbar}>
        <ListFilter id="users-filter" value={filter} options={FILTERS} onChange={setFilter} />
        {shown && (
          <span className={styles.count} aria-live="polite">
            {shown.length === 1 ? "1 user" : `${String(shown.length)} users`}
          </span>
        )}
        <span className={styles.spacer} />
        {canAddUsers && <InviteUserDialog membership={membership} />}
      </div>

      <div className={styles.split} data-detail={selected ? "" : undefined}>
        <div className={styles.listArea}>
          {isPending && <TableSkeleton label="users" columns={[320, 120, 56]} rows={5} />}

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
              body="Add someone and they will appear here once the invitation is sent."
            />
          )}

          {shown && users && users.length > 0 && (
            <>
              <UserTable
                users={shown}
                membership={membership}
                basePath={basePath}
                selectedId={selected?.id}
                onSelect={(id) => void navigate(`${basePath}/${id}`)}
                onRemoved={(id) => {
                  if (id === userId) void navigate(basePath);
                }}
                /*
                  Deliberately no "Add user" in the message. The data exists —
                  the filter or the search is the problem, so the exit is to
                  widen it.
                */
                emptyText={
                  query.trim()
                    ? `No ${FILTER_WORD[filter]}users match “${query.trim()}”.`
                    : `No ${FILTER_WORD[filter]}users.`
                }
              />
            </>
          )}

          {/*
            A URL naming somebody who is not in the list: a stale link, or a
            person removed since it was sent. Said plainly rather than silently
            dropping the panel, which would look like the link had worked.
          */}
          {userId && users && !selected && (
            <p className={styles.missing} role="status">
              That person is no longer in {membership.org_name}.{" "}
              <Link to={basePath} className={styles.linkButton}>
                Back to all users
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={styles.panelSlot}>
            {/*
              `key` makes this a NEW panel per person rather than the same one
              handed different props — otherwise one person's finished resend
              or failed deactivation shows up on the next one's panel.
            */}
            <UserDetailPanel
              key={selected.id}
              user={selected}
              membership={membership}
              onClose={() => void navigate(basePath)}
            />
          </div>
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
