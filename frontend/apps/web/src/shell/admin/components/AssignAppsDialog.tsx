/**
 * Assign applications to a person (C83, the owner 2026-11-20, designed on the
 * canvas "Assign app dialog"): Admin panel → Users → a person → Applications
 * → "+".
 *
 * TWO STEPS IN ONE DIALOG, the Zoho way:
 *
 *   1. CHOOSE — the apps this organisation subscribes to that the person
 *      does not have yet, searchable, each with a checkbox and a ›. Ticking
 *      an app opens its details straight away, so nothing is ticked without
 *      them; › reopens them.
 *   2. DETAILS — what that app needs to be assigned. TODAY ONLY ITS ROLE; an
 *      app that later needs more (a department, an approver, a policy) adds
 *      its fields in `AppDetailsFields` alone — step 1 never changes.
 *
 * "Assign N apps" sends them all in ONE request, all or nothing. Adds,
 * never replaces: changing a role is the app tile's Edit.
 *
 * DMS offers EVERY DMS role (2026-11-24: only app roles; the person gets no
 * territory until assigned one in Territory Management). Other apps are
 * organisation-wide, so their organisation-level roles. A pending person gets
 * the apps on their invitation.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { useShellContext } from "../../context";
import { grantableApps, type AppDefinition } from "../../navigation";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { rolesFor, type Role } from "../api/roles";
import type { OrgUser } from "../api/users";
import { useRoles } from "../hooks/useRoles";
import { useAssignApps } from "../hooks/useUsers";
import { RolePicker } from "./RolePicker";
import { displayName } from "./UserActions";
import dialog from "./InviteUserDialog.module.css";
import styles from "./AssignAppsDialog.module.css";

/** What one app needs to be assigned. Today its role; more fields go here. */
interface AppDetails {
  role: string;
}

interface AssignAppsDialogProps {
  user: OrgUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignAppsDialog({ user, open, onOpenChange }: AssignAppsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={dialog.dialog} aria-describedby={undefined}>
          {/* Remounted on each open, so nothing ticked last time lingers. */}
          {open && <AssignApps user={user} onDone={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AssignApps({ user, onDone }: { user: OrgUser; onDone: () => void }) {
  const { membership } = useShellContext();
  const { data: roles = [] } = useRoles();
  const { mutateAsync: assign, isPending } = useAssignApps();
  const name = displayName(user);

  /* The apps that can be given: bought, and not already held. */
  const held = new Set(user.apps.map((grant) => grant.app));
  const assignable = grantableApps(membership).filter((app) => !held.has(app.key));

  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, AppDetails>>({});
  /** The app whose details page is open (step 2), or null on the list. */
  const [detailsFor, setDetailsFor] = useState<AppDefinition | null>(null);
  const [error, setError] = useState<{ message: string; traceId?: string } | null>(null);

  const optionsFor = (appKey: string): Role[] => rolesFor(roles, appKey, false);

  if (detailsFor) {
    return (
      <AppDetailsStep
        app={detailsFor}
        personName={name}
        options={optionsFor(detailsFor.key)}
        initial={chosen[detailsFor.key]}
        onBack={() => setDetailsFor(null)}
        onDone={(details) => {
          setChosen((current) => ({ ...current, [detailsFor.key]: details }));
          setDetailsFor(null);
        }}
      />
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = assignable.filter((app) => !needle || app.name.toLowerCase().includes(needle));
  const count = Object.keys(chosen).length;

  async function submit() {
    setError(null);
    try {
      await assign({
        userId: user.id,
        apps: Object.entries(chosen).map(([app, details]) => ({ app, role: details.role })),
      });
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
        <div className={styles.heading}>
          <Dialog.Title className={dialog.title}>Assign applications</Dialog.Title>
          <p className={dialog.description}>
            to {name}
            {user.status === "invited" && <span className={styles.tag}>Pending</span>}
          </p>
        </div>
        <Dialog.Close className={styles.iconButton} aria-label="Close">
          <CloseIcon />
        </Dialog.Close>
      </div>

      {assignable.length === 0 ? (
        <>
          <div className={dialog.body}>
            <p className={styles.empty}>
              {user.first_name || name} already has every app {membership.org_name} subscribes
              to.
            </p>
            <p className={styles.hint}>
              Change the role in one of them from its tile, or add an app to{" "}
              {membership.org_name} in App Management first.
            </p>
          </div>
          <div className={dialog.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </Dialog.Close>
          </div>
        </>
      ) : (
        <>
          <div className={dialog.body}>
            {error && <FormBanner traceId={error.traceId}>{error.message}</FormBanner>}

            {user.status === "invited" && (
              <p className={styles.notice}>
                {user.first_name || name} has not joined yet. The apps wait on the invitation
                and are theirs the moment they accept it.
              </p>
            )}

            <label className={styles.search}>
              <SearchIcon />
              <span className={styles.visuallyHidden}>Search applications</span>
              <input
                type="search"
                placeholder="Search applications"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <ul className={styles.list} aria-label={`Applications ${name} can be given`}>
              {shown.map((app) => {
                const details = chosen[app.key];
                const roleName = optionsFor(app.key).find((r) => r.code === details?.role)?.name;
                return (
                  <li key={app.key} className={styles.row} data-chosen={details ? "" : undefined}>
                    <label className={styles.rowLabel}>
                      <input
                        type="checkbox"
                        checked={Boolean(details)}
                        onChange={() => {
                          if (details) {
                            setChosen(({ [app.key]: _removed, ...rest }) => rest);
                          } else {
                            // Ticking opens the details: nothing is ticked without them.
                            setDetailsFor(app);
                          }
                        }}
                      />
                      <span className={styles.badge} aria-hidden="true">
                        {app.initials}
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{app.name}</span>
                        <span className={styles.rowSub}>
                          {details ? `Role: ${roleName ?? details.role}` : app.description}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`${app.name} details`}
                      onClick={() => setDetailsFor(app)}
                    >
                      <ChevronIcon />
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className={styles.hint}>No applications match “{query.trim()}”.</li>
              )}
            </ul>

            <p className={styles.hint}>
              Only apps {membership.org_name} subscribes to that {user.first_name || name} does
              not have yet. Ticking an app opens its details.
            </p>
          </div>

          <div className={dialog.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={count === 0}
              isLoading={isPending}
              onClick={() => void submit()}
            >
              {isPending ? "Assigning…" : count === 1 ? "Assign 1 app" : `Assign ${String(count)} apps`}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

interface AppDetailsStepProps {
  app: AppDefinition;
  personName: string;
  options: Role[];
  initial: AppDetails | undefined;
  onBack: () => void;
  onDone: (details: AppDetails) => void;
}

/** Step 2: what one app needs to be assigned. */
function AppDetailsStep({ app, personName, options, initial, onBack, onDone }: AppDetailsStepProps) {
  // One role preselects itself (`RolePicker`'s rule); several start unchosen.
  const [details, setDetails] = useState<AppDetails>(
    initial ?? { role: options.length === 1 ? (options[0]?.code ?? "") : "" },
  );
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <>
      <div className={styles.header}>
        {/* "Back", not "Back to applications": that is the footer's button,
            and two controls with one name are ambiguous to a screen reader. */}
        <button type="button" className={styles.iconButton} aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <div className={styles.heading}>
          <Dialog.Title className={dialog.title}>Assign applications</Dialog.Title>
          <p className={dialog.description}>to {personName}</p>
        </div>
      </div>

      <div className={dialog.body}>
        <div className={styles.appHeader}>
          <span className={styles.bigBadge} aria-hidden="true">
            {app.initials}
          </span>
          <span className={styles.rowText}>
            <span className={styles.appName}>{app.name}</span>
            <span className={styles.rowSub}>Information needed to assign this app.</span>
          </span>
        </div>

        {problem && <FormBanner>{problem}</FormBanner>}

        <AppDetailsFields app={app} options={options} details={details} onChange={setDetails} />

        <p className={styles.notice}>
          Applies across your whole organisation. Placing somebody within {app.name} comes with
          its own territories, later.
        </p>
      </div>

      <div className={dialog.actions}>
        <Button type="button" variant="secondary" onClick={onBack}>
          Back to applications
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!details.role) {
              setProblem(`Choose a role for ${app.name}.`);
              return;
            }
            onDone(details);
          }}
        >
          Done
        </Button>
      </div>
    </>
  );
}

interface AppDetailsFieldsProps {
  app: AppDefinition;
  options: Role[];
  details: AppDetails;
  onChange: (details: AppDetails) => void;
}

/**
 * THE ONE PLACE AN APP'S ASSIGNMENT FIELDS LIVE. Every app asks for its role
 * today; an app that needs more renders them here, for its own `app.key`.
 */
function AppDetailsFields({ app, options, details, onChange }: AppDetailsFieldsProps) {
  return (
    <div className={styles.roleRow}>
      <RolePicker
        appName={app.name}
        appKey={app.key}
        options={options}
        value={details.role}
        onChange={(role) => onChange({ ...details, role })}
      />
      <button type="button" className={styles.later} aria-disabled="true" title="Coming later">
        Create a new role
      </button>
    </div>
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

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
