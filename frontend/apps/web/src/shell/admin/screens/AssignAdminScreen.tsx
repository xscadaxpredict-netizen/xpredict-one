/**
 * Admins and Roles -> Admins -> Assign Admin (C89; the owner, 2026-11-23, from
 * Zoho's): give several people ONE Admin panel role -- Organization Admin or
 * one of the organisation's own. A page (`admins-and-roles/assign-admin`), not
 * a dialog, as Zoho's is; a custom role's panel -> Assign Users opens it with
 * that role chosen (`?role=<code>`).
 *
 *   Users *  people as chips, a search and a "+". Offered: members who hold no
 *            Admin panel role yet. Shown greyed, with why: a pending person
 *            ("Hasn't joined yet", C83) and somebody placed at a dealership
 *            ("Works at …": an Admin panel role reaches the whole
 *            organisation). Never the owner, nor anybody already an admin --
 *            changing a role is the admin row's Manage Roles.
 *   Role *   Organization Admin and the organisation's own roles. One that
 *            grants more than the viewer holds is greyed (`grantable`).
 *
 * Assign is one request, all or nothing. NONE OF THIS IS SECURITY: the server
 * applies every rule again and says which one refused.
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState } from "@xpredict/ui";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useShellContext } from "../../context";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import type { OrgUser } from "../api/users";
import { displayName } from "../components/UserActions";
import { useAssignAdmin } from "../hooks/useAdmins";
import { usePanelRoles } from "../hooks/useRoles";
import { useUsers } from "../hooks/useUsers";
import page from "./NewRoleScreen.module.css";
import styles from "./AssignAdminScreen.module.css";

/** Why somebody cannot be picked, or null if they can. */
function whyNot(person: OrgUser): string | null {
  if (person.status === "invited") return "Hasn't joined yet";
  if (person.unit_id !== null) return `Works at ${person.unit_name ?? "a dealership"}`;
  return null;
}

export function AssignAdminScreen() {
  const { membership } = useShellContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetRole = params.get("role") ?? "";
  const base = `/${membership.org_slug}/admin/admins-and-roles`;
  // Cancel goes back where Assign Admin was opened from. The Admins tab is
  // the sub-module's own address.
  const backPath = presetRole ? `${base}/roles/${presetRole}` : base;

  const people = useUsers();
  const roles = usePanelRoles();
  const { mutateAsync: assign, isPending: saving } = useAssignAdmin();

  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState(presetRole);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ message: string; traceId?: string } | null>(null);

  async function submit() {
    setProblem(null);
    setUsersError(picked.length === 0 ? "Pick at least one person." : null);
    setRoleError(role === "" ? "Choose a role." : null);
    if (picked.length === 0 || role === "") return;
    try {
      await assign({ users: picked, role });
      void navigate(base);
    } catch (failure) {
      const found = asProblem(failure);
      setProblem({
        message: found.errors?.[0]?.detail ?? found.detail,
        traceId: found.status >= 500 ? found.trace_id : undefined,
      });
    }
  }

  // Nobody who already holds an Admin panel role -- the owner included.
  const candidates = (people.data ?? []).filter((person) => person.admin_role === null);
  const offered = (roles.data ?? []).filter((r) => r.code !== "owner");

  return (
    <div className={page.page}>
      <header className={page.header}>
        <h1 className={page.title}>Assign Admin</h1>
      </header>

      <div className={page.body}>
        {(people.isError || roles.isError) && (
          <ErrorState
            title="Could not load the people or the roles"
            code={asProblem(people.error ?? roles.error).code}
            traceId={asProblem(people.error ?? roles.error).trace_id}
            onRetry={() => {
              void people.refetch();
              void roles.refetch();
            }}
          />
        )}

        <section aria-label="Assign Admin" className={page.card}>
          {problem && <FormBanner traceId={problem.traceId}>{problem.message}</FormBanner>}

          <div className={styles.form}>
            <div className={page.field}>
              <span id="assign-users-label" className={page.label}>
                Users <span className={page.required}>*</span>
              </span>
              <PeoplePicker
                people={candidates}
                loading={people.isPending}
                picked={picked}
                invalid={usersError !== null}
                onChange={(next) => {
                  setPicked(next);
                  if (next.length > 0) setUsersError(null);
                }}
              />
              {usersError && (
                <p id="assign-users-error" className={page.fieldError}>
                  {usersError}
                </p>
              )}
            </div>

            <div className={page.field}>
              <label htmlFor="assign-role" className={page.label}>
                Role <span className={page.required}>*</span>
              </label>
              <select
                id="assign-role"
                className={page.input}
                value={role}
                aria-invalid={roleError ? true : undefined}
                aria-describedby={roleError ? "assign-role-error" : undefined}
                onChange={(event) => {
                  setRole(event.target.value);
                  setRoleError(null);
                }}
              >
                <option value="" disabled>
                  {roles.isPending ? "Loading roles…" : "Select the role for the users"}
                </option>
                {offered.map((r) => (
                  <option key={r.code} value={r.code} disabled={!r.grantable}>
                    {r.grantable ? r.name : `${r.name} — more than you hold`}
                  </option>
                ))}
              </select>
              {roleError && (
                <p id="assign-role-error" className={page.fieldError}>
                  {roleError}
                </p>
              )}
            </div>

            <div className={styles.actions}>
              <Button type="button" isLoading={saving} onClick={() => void submit()}>
                {saving ? "Assigning…" : "Assign"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void navigate(backPath)}>
                Cancel
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

interface PeoplePickerProps {
  people: OrgUser[];
  loading: boolean;
  picked: string[];
  invalid: boolean;
  onChange: (picked: string[]) => void;
}

/**
 * Chips for who is picked, a search, and a list underneath that stays open
 * while you pick several. Enter picks the first match; Escape closes it.
 */
function PeoplePicker({ people, loading, picked, invalid, onChange }: PeoplePickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const byId = new Map(people.map((person) => [person.id, person]));
  const needle = query.trim().toLowerCase();
  const matches = people.filter(
    (person) =>
      needle === "" ||
      `${person.first_name} ${person.last_name} ${person.email}`.toLowerCase().includes(needle),
  );

  function toggle(person: OrgUser) {
    if (whyNot(person)) return;
    onChange(
      picked.includes(person.id) ? picked.filter((id) => id !== person.id) : [...picked, person.id],
    );
    setQuery("");
    input.current?.focus();
  }

  return (
    <div
      ref={container}
      className={styles.picker}
      onBlur={(event) => {
        if (!container.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className={styles.control} aria-invalid={invalid || undefined}>
        {picked.map((id) => {
          const person = byId.get(id);
          const name = person ? displayName(person) : id;
          return (
            <span key={id} className={styles.chip}>
              <span className={styles.chipName}>{name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove ${name}`}
                onClick={() => onChange(picked.filter((p) => p !== id))}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-labelledby="assign-users-label"
          aria-expanded={open}
          aria-controls="assign-users-list"
          aria-autocomplete="list"
          aria-describedby={invalid ? "assign-users-error" : undefined}
          className={styles.search}
          placeholder={picked.length === 0 ? "Select the users" : ""}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter") {
              event.preventDefault();
              const first = matches.find(
                (person) => !whyNot(person) && !picked.includes(person.id),
              );
              if (first) toggle(first);
            }
            if (event.key === "Backspace" && query === "" && picked.length > 0) {
              onChange(picked.slice(0, -1));
            }
          }}
        />
        <button
          type="button"
          className={styles.plus}
          aria-label="Show people"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current);
            input.current?.focus();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <ul
          id="assign-users-list"
          role="listbox"
          aria-multiselectable="true"
          aria-label="People"
          className={styles.listbox}
        >
          {loading && <li className={styles.empty}>Loading people…</li>}
          {!loading && matches.length === 0 && (
            <li className={styles.empty}>
              {people.length === 0 ? "Everybody is an admin already." : "Nobody matches."}
            </li>
          )}
          {matches.map((person) => {
            const reason = whyNot(person);
            const selected = picked.includes(person.id);
            return (
              <li
                key={person.id}
                role="option"
                aria-selected={selected}
                aria-disabled={reason ? "true" : undefined}
                className={styles.option}
                // Keep the focus in the search, so the list stays open.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggle(person)}
              >
                <span className={styles.optionText}>
                  <span className={styles.optionName}>{displayName(person)}</span>
                  {displayName(person) !== person.email && (
                    <span className={styles.optionSub}>{person.email}</span>
                  )}
                </span>
                {reason && <span className={styles.reason}>{reason}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
