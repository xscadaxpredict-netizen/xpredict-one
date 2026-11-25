/**
 * Applications -> an app -> ⋮ -> Assign users (the owner, 2026-11-20): give one
 * app to several people at once, all with the same role, the way Zoho's
 * "Assign" does. Change one person's role afterwards from their app tile.
 *
 * TWO STEPS IN ONE DIALOG, like Assign applications (which is the same act
 * from the person's side):
 *
 *   1. PEOPLE -- everyone who does not hold this app yet, searchable, with a
 *      checkbox. Pending people too, tagged. Not the owner, who holds every
 *      app by rule. Somebody at a dealership cannot hold an organisation-wide
 *      app (C27), so for anything but DMS they are shown greyed, with why.
 *   2. ROLE -- one role for all of them (any DMS role; for other apps an
 *      organisation-level one), then
 *      "Assign N users". One request, all or nothing.
 *
 * NONE OF THIS IS SECURITY: the server applies every rule again.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { findApp } from "../../navigation";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import type { Application } from "../api/applications";
import { rolesFor } from "../api/roles";
import type { OrgUser } from "../api/users";
import { useRoles } from "../hooks/useRoles";
import { useAssignUsersToApp, useUsers } from "../hooks/useUsers";
import { RolePicker } from "./RolePicker";
import { displayName } from "./UserActions";
import { initials } from "./UserTable";
import dialog from "./InviteUserDialog.module.css";
import styles from "./AssignAppsDialog.module.css";

interface AssignUsersDialogProps {
  app: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignUsersDialog({ app, open, onOpenChange }: AssignUsersDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={dialog.dialog} aria-describedby={undefined}>
          {/* Remounted on each open, so nobody ticked last time lingers. */}
          {open && <AssignUsers app={app} onDone={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Why somebody cannot be picked for this app, or null if they can. */
function whyNot(person: OrgUser, appCode: string): string | null {
  // C27: a dealership's person holds DMS there and nothing organisation-wide.
  if (appCode !== "dms" && person.unit_id !== null) {
    return `Works at ${person.unit_name ?? "a dealership"}`;
  }
  return null;
}

function AssignUsers({ app, onDone }: { app: Application; onDone: () => void }) {
  const { data: people = [], isPending: loadingPeople } = useUsers();
  const [chosen, setChosen] = useState<string[]>([]);
  const [step, setStep] = useState<"people" | "role">("people");
  const [query, setQuery] = useState("");

  // Everyone who could be given it: not the owner, not holding it already.
  const candidates = people.filter(
    (person) => person.role !== "owner" && !person.apps.some((held) => held.app === app.code),
  );
  const needle = query.trim().toLowerCase();
  const shown = candidates.filter(
    (person) =>
      !needle ||
      displayName(person).toLowerCase().includes(needle) ||
      person.email.toLowerCase().includes(needle),
  );

  if (step === "role") {
    return (
      <RoleStep
        app={app}
        users={chosen}
        onBack={() => setStep("people")}
        onDone={onDone}
      />
    );
  }

  const count = chosen.length;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.heading}>
          <Dialog.Title className={dialog.title}>Assign users</Dialog.Title>
          <p className={dialog.description}>to {app.name}</p>
        </div>
        <Dialog.Close className={styles.iconButton} aria-label="Close">
          <CloseIcon />
        </Dialog.Close>
      </div>

      <div className={dialog.body}>
        {loadingPeople ? (
          <p className={styles.hint} role="status">
            Loading people…
          </p>
        ) : candidates.length === 0 ? (
          <p className={styles.empty}>Everybody in your organisation already has {app.name}.</p>
        ) : (
          <>
            <label className={styles.search}>
              <SearchIcon />
              <span className={styles.visuallyHidden}>Search people</span>
              <input
                type="search"
                placeholder="Search people"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <ul className={styles.list} aria-label={`People who can be given ${app.name}`}>
              {shown.map((person) => {
                const reason = whyNot(person, app.code);
                const ticked = chosen.includes(person.id);
                return (
                  <li
                    key={person.id}
                    className={styles.row}
                    data-chosen={ticked ? "" : undefined}
                  >
                    <label
                      className={styles.rowLabel}
                      aria-disabled={reason ? "true" : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={ticked}
                        disabled={reason !== null}
                        onChange={() =>
                          setChosen((current) =>
                            ticked ? current.filter((id) => id !== person.id) : [...current, person.id],
                          )
                        }
                      />
                      <span className={styles.badge} aria-hidden="true">
                        {initials(person)}
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>
                          {displayName(person)}
                          {person.status === "invited" && (
                            <span className={styles.tag}>Pending</span>
                          )}
                        </span>
                        <span className={styles.rowSub}>{reason ?? person.email}</span>
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
              Only people who do not have {app.name} yet. They all get the same role next; change
              one person&rsquo;s afterwards from their app tile.
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
        <Button type="button" disabled={count === 0} onClick={() => setStep("role")}>
          {count === 0 ? "Next" : `Next (${String(count)})`}
        </Button>
      </div>
    </>
  );
}

interface RoleStepProps {
  app: Application;
  users: string[];
  onBack: () => void;
  onDone: () => void;
}

/** Step 2: the one role they all get. */
function RoleStep({ app, users, onBack, onDone }: RoleStepProps) {
  const { data: roles = [] } = useRoles();
  const { mutateAsync: assign, isPending } = useAssignUsersToApp();
  // Organisation-wide, like Assign applications, until per-app territories (C82).
  const options = rolesFor(roles, app.code, false);
  const [role, setRole] = useState(options.length === 1 ? (options[0]?.code ?? "") : "");
  const [error, setError] = useState<{ message: string; traceId?: string } | null>(null);
  const definition = findApp(app.code);
  const count = users.length;

  async function submit() {
    if (!role) {
      setError({ message: `Choose a role in ${app.name}.` });
      return;
    }
    setError(null);
    try {
      await assign({ app: app.code, users, role });
      onDone();
    } catch (failure) {
      const problem = asProblem(failure);
      setError({
        message: problem.detail,
        traceId: problem.status >= 500 ? problem.trace_id : undefined,
      });
    }
  }

  return (
    <>
      <div className={styles.header}>
        <button type="button" className={styles.iconButton} aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <div className={styles.heading}>
          <Dialog.Title className={dialog.title}>Assign users</Dialog.Title>
          <p className={dialog.description}>to {app.name}</p>
        </div>
      </div>

      <div className={dialog.body}>
        <div className={styles.appHeader}>
          <span className={styles.bigBadge} aria-hidden="true">
            {definition?.initials ?? app.code.slice(0, 2).toUpperCase()}
          </span>
          <span className={styles.rowText}>
            <span className={styles.appName}>{app.name}</span>
            <span className={styles.rowSub}>
              {count === 1 ? "1 person" : `${String(count)} people`}, one role for all.
            </span>
          </span>
        </div>

        {error && <FormBanner traceId={error.traceId}>{error.message}</FormBanner>}

        <div className={styles.roleRow}>
          <RolePicker
            appName={app.name}
            appKey={app.code}
            options={options}
            value={role}
            onChange={setRole}
          />
          <button type="button" className={styles.later} aria-disabled="true" title="Coming later">
            Create a new role
          </button>
        </div>

        <p className={styles.notice}>
          Applies across your whole organisation. Placing somebody within {app.name} comes with its
          own territories, later.
        </p>
      </div>

      <div className={dialog.actions}>
        <Button type="button" variant="secondary" onClick={onBack}>
          Back to people
        </Button>
        <Button type="button" isLoading={isPending} onClick={() => void submit()}>
          {isPending ? "Assigning…" : count === 1 ? "Assign 1 user" : `Assign ${String(count)} users`}
        </Button>
      </div>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M10 3.5L5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
