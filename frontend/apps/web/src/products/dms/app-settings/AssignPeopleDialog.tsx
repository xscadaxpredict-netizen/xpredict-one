/**
 * A territory's Assign users (the owner, 2026-11-24): pick DMS users and ADD
 * this territory to where each works. NO ROLE -- they got it with DMS -- and
 * NO "current place" choice: it only adds (moving is the People tab's Move, or
 * DMS Users -> Edit). One request, all or nothing.
 *
 * Only people who hold DMS, not the owner (everywhere by rule). Greyed, with
 * why: somebody already here, and somebody pending (placed once they join).
 * NONE OF THIS IS SECURITY: the server applies every rule again (C27 too).
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import dialog from "../../../shell/admin/components/InviteUserDialog.module.css";
import styles from "../../../shell/admin/components/AssignAppsDialog.module.css";
import type { AppUser } from "./api";
import { displayName } from "./DmsUserActions";
import { initials } from "./DmsUserDetailPanel";
import type { DmsTerritory, TerritoryPerson } from "./territories";
import { useDmsUsers } from "./useDmsUsers";
import { useAssignPeople } from "./useTerritories";

interface AssignPeopleDialogProps {
  territory: DmsTerritory;
  /** Who works here already: shown greyed. */
  here: TerritoryPerson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignPeopleDialog({ territory, here, open, onOpenChange }: AssignPeopleDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={dialog.dialog} aria-describedby={undefined}>
          {/* Remounted on each open, so nobody ticked last time lingers. */}
          {open && (
            <AssignPeople territory={territory} here={here} onDone={() => onOpenChange(false)} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AssignPeople({
  territory,
  here,
  onDone,
}: {
  territory: DmsTerritory;
  here: TerritoryPerson[];
  onDone: () => void;
}) {
  const { data: users = [], isPending: loading } = useDmsUsers();
  const { mutateAsync: assign, isPending: saving } = useAssignPeople();
  const [chosen, setChosen] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hereIds = new Set(here.map((person) => person.id));
  const candidates = users.filter((user) => !user.is_owner);
  const needle = query.trim().toLowerCase();
  const shown = candidates.filter(
    (user) =>
      !needle ||
      displayName(user).toLowerCase().includes(needle) ||
      user.email.toLowerCase().includes(needle),
  );

  function whyNot(user: AppUser): string | null {
    if (hereIds.has(user.id)) return `Already at ${territory.name}`;
    if (user.status === "pending") return "Not joined yet — assign them once they have";
    return null;
  }

  function whereNow(user: AppUser): string {
    const role = user.role?.name ?? "No role";
    return user.places.length > 0
      ? `${role} · at ${user.places.map((place) => place.name).join(", ")}`
      : `${role} · not placed yet`;
  }

  async function onAssign() {
    setError(null);
    try {
      await assign({ territoryId: territory.id, users: chosen });
      onDone();
    } catch (failure) {
      setError(asProblem(failure).detail);
    }
  }

  const count = chosen.length;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.heading}>
          <Dialog.Title className={dialog.title}>Assign users</Dialog.Title>
          <p className={dialog.description}>to {territory.name}</p>
        </div>
        <Dialog.Close className={styles.iconButton} aria-label="Close">
          <XIcon size={18} aria-hidden="true" />
        </Dialog.Close>
      </div>

      <div className={dialog.body}>
        {error && <FormBanner>{error}</FormBanner>}

        {loading ? (
          <p className={styles.hint} role="status">
            Loading DMS users…
          </p>
        ) : candidates.length === 0 ? (
          <p className={styles.empty}>Nobody holds DMS yet. Add people in DMS settings → Users.</p>
        ) : (
          <>
            <label className={styles.search}>
              <SearchIcon size={16} aria-hidden="true" />
              <span className={styles.visuallyHidden}>Search DMS users</span>
              <input
                type="search"
                placeholder="Search DMS users"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <ul className={styles.list} aria-label={`DMS users who can work at ${territory.name}`}>
              {shown.map((user) => {
                const reason = whyNot(user);
                const ticked = chosen.includes(user.id);
                return (
                  <li key={user.id} className={styles.row} data-chosen={ticked ? "" : undefined}>
                    <label className={styles.rowLabel} aria-disabled={reason ? "true" : undefined}>
                      <input
                        type="checkbox"
                        checked={ticked}
                        disabled={reason !== null}
                        onChange={() =>
                          setChosen((current) =>
                            ticked ? current.filter((id) => id !== user.id) : [...current, user.id],
                          )
                        }
                      />
                      <span className={styles.badge} aria-hidden="true">
                        {initials(user)}
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>
                          {displayName(user)}
                          {user.status === "pending" && <span className={styles.tag}>Pending</span>}
                        </span>
                        <span className={styles.rowSub}>{reason ?? whereNow(user)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className={styles.hint}>Nobody matches “{query.trim()}”.</li>
              )}
            </ul>

            <p className={styles.hint}>
              Only people who hold DMS. They keep their role; {territory.name} is added to where
              they work. To move somebody, use Move on the People tab or Edit in DMS Users.
            </p>
          </>
        )}
      </div>

      <div className={dialog.actions}>
        <Dialog.Close asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Dialog.Close>
        <Button
          type="button"
          isLoading={saving}
          disabled={count === 0 || saving}
          onClick={() => void onAssign()}
        >
          {saving ? "Assigning…" : count === 0 ? "Assign" : `Assign (${String(count)})`}
        </Button>
      </div>
    </>
  );
}
