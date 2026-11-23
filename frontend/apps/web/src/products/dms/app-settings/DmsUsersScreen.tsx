/**
 * DMS settings -> Users & Roles -> Users (the owner, 2026-11-23): everybody who
 * holds DMS, in the SAME FORMAT as the Admin panel's Users list
 * (`ListPage.module.css`, `ListFilter`) -- title, toolbar with the filter on
 * the left and the main button on the right, then the table in its card. The
 * TOPBAR's box searches it ("Search users", by name or email).
 *
 * THE CONTENT IS DMS'S: User details, Role (in DMS), Territory, Status -- from
 * the owner's Zoho screenshot, plus where DMS places each person.
 *
 * THE OWNER FIRST, AND ALWAYS: every app has the owner by default. Their role
 * reads "Owner" and their territory "All" -- they hold every app, everywhere,
 * by rule (C72), whatever grant they may also carry.
 *
 * DRAWN ONLY, for now (the owner's choice): "Invite User" and each row's ⋮
 * are greyed out, and clicking a person opens nothing yet.
 */

import { useState } from "react";
import { EllipsisVerticalIcon } from "lucide-react";
import { asProblem } from "@xpredict/api-client";
import { ErrorState, InfoHint, TableSkeleton } from "@xpredict/ui";

import { useShellContext } from "../../../shell/context";
import { ListFilter } from "../../../shell/admin/components/ListFilter";
import listStyles from "../../../shell/admin/screens/ListPage.module.css";
import { usePageSearch } from "../../../stores/pageSearchStore";
import type { AppUser, AppUserStatus } from "./api";
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

  const shown = users?.filter(
    (user) => (filter === "all" || user.status === filter) && matches(user, query),
  );

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
        <button
          type="button"
          className={listStyles.primaryButton}
          aria-disabled="true"
          title="Coming soon"
        >
          <PlusIcon />
          Invite User
        </button>
      </div>

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

      {shown && (
        <div className={listStyles.tableWrap}>
          <table className={listStyles.table}>
            <caption className={listStyles.visuallyHidden}>
              Everyone who holds DMS, the owner first.
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
                <UserRow key={user.id} user={user} />
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
    </div>
  );
}

function UserRow({ user }: { user: AppUser }) {
  return (
    <tr>
      <th scope="row">
        <div className={listStyles.entity}>
          <span className={listStyles.badge} aria-hidden="true">
            {initials(user)}
          </span>
          <div className={listStyles.stack}>
            <span className={listStyles.primary}>{displayName(user)}</span>
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
      <td className={listStyles.actions}>
        <button
          type="button"
          className={styles.menuTrigger}
          aria-label={`More actions for ${displayName(user)}`}
          aria-disabled="true"
          title="Coming soon"
        >
          <EllipsisVerticalIcon size={18} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

/** Their name, or their email while they have none (somebody invited unnamed). */
function displayName(user: Pick<AppUser, "first_name" | "last_name" | "email">): string {
  const name = `${user.first_name} ${user.last_name}`.trim();
  return name || user.email;
}

function initials(user: Pick<AppUser, "first_name" | "last_name" | "email">): string {
  const letters = [user.first_name, user.last_name]
    .map((part) => part.trim()[0])
    .filter((letter): letter is string => Boolean(letter));
  return (letters.length > 0 ? letters.join("") : user.email.slice(0, 2)).toUpperCase();
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
