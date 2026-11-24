/**
 * DMS settings -> Users & Roles -> Users (the owner, 2026-11-23): everybody who
 * holds DMS, in the SAME FORMAT as the Admin panel's Users list
 * (`ListPage.module.css`, `ListFilter`) -- title, toolbar with the filter on
 * the left and the main button on the right, then the list and the open person
 * side by side. The TOPBAR's box searches it ("Search users", by name or email).
 *
 * THE CONTENT IS DMS'S: User details, Role (in DMS), Territory, Status -- from
 * the owner's Zoho screenshot, plus where DMS places each person.
 *
 * THE OWNER FIRST, AND ALWAYS: every app has the owner by default. Their role
 * reads "Owner" and their territory "All" -- they hold every app, everywhere,
 * by rule (C72), whatever grant they may also carry.
 *
 * ADD USER (2026-11-24): a person and their DMS role (`AddDmsUserDialog`).
 * EACH ROW'S ⋮ (2026-11-24): Edit, Deactivate / Activate, Delete -- all on the
 * person's DMS (`DmsUserActions`). CLICKING A PERSON opens them beside the
 * list with one tab, Basic Info (`DmsUserDetailPanel`), at `users/<id>`.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { ErrorState, InfoHint, TableSkeleton } from "@xpredict/ui";

import { useAccess } from "../../../shell/access";
import { useShellContext } from "../../../shell/context";
import { ListFilter } from "../../../shell/admin/components/ListFilter";
import listStyles from "../../../shell/admin/screens/ListPage.module.css";
import { usePageSearch } from "../../../stores/pageSearchStore";
import type { AppUser, AppUserStatus } from "./api";
import { AddDmsUserDialog } from "./AddDmsUserDialog";
import { DmsUserActions, displayName } from "./DmsUserActions";
import { DmsUserDetailPanel, initials } from "./DmsUserDetailPanel";
import { useDmsUsers } from "./useDmsUsers";
import styles from "./DmsUsersScreen.module.css";

type Filter = "all" | AppUserStatus;

const FILTERS = [
  { value: "all", label: "All users" },
  { value: "active", label: "Active users" },
  { value: "inactive", label: "Inactive users" },
  { value: "pending", label: "Pending users" },
] as const;

const FILTER_WORD: Record<Filter, string> = {
  all: "",
  active: "active ",
  inactive: "inactive ",
  pending: "pending ",
};

const STATUS_LABEL: Record<AppUserStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
};

export function DmsUsersScreen() {
  const { membership } = useShellContext();
  const { data: users, isPending, isError, error, refetch } = useDmsUsers();
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<Filter>("all");
  const [statusError, setStatusError] = useState<string | null>(null);
  // Add User is `dms.user.create` -- the owner's, for now (C78 amended).
  const canAdd = useAccess().can("dms.user.create");

  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/dms/settings/users`;

  /*
   * `shown` is the LIST's view (filter, search); `selected` is what the URL says
   * is OPEN, looked up in the FULL list -- a search is no reason to close the
   * person somebody is reading (the Admin panel's Users, for the same reason).
   */
  const shown = users?.filter(
    (user) => (filter === "all" || user.status === filter) && matches(user, query),
  );
  const selected = userId ? users?.find((user) => user.id === userId) : undefined;

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Users</h1>
        <InfoHint label="About DMS users">
          Everyone who holds DMS in {membership.org_name}, with their DMS role and where they
          work. The owner holds every app by default.
        </InfoHint>
      </div>

      <div className={listStyles.toolbar}>
        <ListFilter id="dms-users-filter" value={filter} options={FILTERS} onChange={setFilter} />
        {shown && (
          <span className={listStyles.count} aria-live="polite">
            {shown.length === 1 ? "1 user" : `${String(shown.length)} users`}
          </span>
        )}
        <span className={listStyles.spacer} />
        {canAdd ? (
          <AddDmsUserDialog orgName={membership.org_name} />
        ) : (
          <button
            type="button"
            className={listStyles.primaryButton}
            aria-disabled="true"
            title="You do not have permission to add people to DMS"
          >
            <PlusIcon />
            Add User
          </button>
        )}
      </div>

      <div className={listStyles.split} data-detail={selected ? "" : undefined}>
        <div className={listStyles.listArea}>
          {isPending && (
            <TableSkeleton label="users" columns={[320, 160, 160, 96, 56]} rows={5} />
          )}

          {isError && (
            <ErrorState
              title="Could not load users"
              code={asProblem(error).code}
              traceId={asProblem(error).trace_id}
              onRetry={() => void refetch()}
            />
          )}

          {statusError && (
            <p className={listStyles.missing} role="alert">
              {statusError}
            </p>
          )}

          {shown && (
            <div className={listStyles.tableWrap}>
              <table className={listStyles.table}>
                <caption className={listStyles.visuallyHidden}>
                  Everyone who holds DMS, the owner first. Select a person to see their details.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">User details</th>
                    <th scope="col">Role</th>
                    <th scope="col">Territory</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={listStyles.actions}>
                      <span className={listStyles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      basePath={basePath}
                      isOpen={user.id === selected?.id}
                      onSelect={() => void navigate(`${basePath}/${user.id}`)}
                      onRemoved={() => {
                        if (user.id === userId) void navigate(basePath);
                      }}
                      onStatusError={setStatusError}
                    />
                  ))}
                </tbody>
              </table>

              {/* Never "nothing exists": the owner is always there, so an empty
                  table means the filter or the search is too narrow. */}
              {shown.length === 0 && (
                <p className={listStyles.empty}>
                  {query.trim()
                    ? `No ${FILTER_WORD[filter]}users match “${query.trim()}”.`
                    : `No ${FILTER_WORD[filter]}users.`}
                </p>
              )}
            </div>
          )}

          {/* An address naming somebody not in the list: a stale link, or a
              person removed from DMS since. Said, not silently dropped. */}
          {userId && users && !selected && (
            <p className={listStyles.missing} role="status">
              That person no longer holds DMS.{" "}
              <Link to={basePath} className={listStyles.linkButton}>
                Back to all users
              </Link>
            </p>
          )}
        </div>

        {selected && (
          <div className={listStyles.panelSlot}>
            {/* A NEW panel per person, so one person's error never shows on the next. */}
            <DmsUserDetailPanel
              key={selected.id}
              user={selected}
              onClose={() => void navigate(basePath)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface UserRowProps {
  user: AppUser;
  basePath: string;
  isOpen: boolean;
  onSelect: () => void;
  onRemoved: () => void;
  onStatusError: (message: string | null) => void;
}

function UserRow({ user, basePath, isOpen, onSelect, onRemoved, onStatusError }: UserRowProps) {
  return (
    <tr className={listStyles.row} data-open={isOpen || undefined} onClick={onSelect}>
      <th scope="row">
        <div className={listStyles.entity}>
          <span className={listStyles.badge} aria-hidden="true">
            {initials(user)}
          </span>
          <div className={listStyles.stack}>
            <Link
              to={`${basePath}/${user.id}`}
              className={listStyles.primary}
              aria-current={isOpen ? "page" : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              {displayName(user)}
            </Link>
            <span className={listStyles.sub}>{user.email}</span>
          </div>
          {user.is_owner && <span className={styles.ownerTag}>Owner</span>}
        </div>
      </th>
      <td>
        {user.is_owner ? "Owner" : (user.role?.name ?? <span className={listStyles.none}>—</span>)}
      </td>
      <td>
        {user.is_owner ? (
          "All"
        ) : user.territories.length > 0 ? (
          user.territories.join(", ")
        ) : (
          <span className={listStyles.none}>—</span>
        )}
      </td>
      <td>
        <span className={styles.status} data-status={user.status}>
          {STATUS_LABEL[user.status]}
        </span>
      </td>
      {/* Stops clicks from the ⋮ and its dialogs (portals, which React still
          bubbles) reaching the row and opening it. */}
      <td className={listStyles.actions} onClick={(event) => event.stopPropagation()}>
        <DmsUserActions user={user} onRemoved={onRemoved} onStatusError={onStatusError} />
      </td>
    </tr>
  );
}

/** Case-insensitive match across the fields somebody would actually type. */
function matches(user: AppUser, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(needle);
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
