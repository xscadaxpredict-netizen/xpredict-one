/**
 * Admins and Roles → Roles → Add Role: NEW ROLE (C72 piece 5; the owner,
 * 2026-11-20, designed on the canvas "New Role screen" from Zoho's).
 *
 *   Role name*, Description (max 500), Copy permissions from (a built-in role
 *   or one of the organisation's own).
 *
 *   One card per module, one row per page or tab, columns Full / View /
 *   Create / Edit / Delete / Others. A dash: that page has no such action.
 *   "More Permissions" opens the row's special actions underneath.
 *
 * THE GRID IS THE SERVER'S SECTION TREE (`/admin/role-builder/`), not a list
 * typed here: a new page or action appears with its migration.
 *
 * THE RULES, AS YOU CLICK (C79 rule 5): ticking anything ticks the row's View;
 * unticking View clears the row; Full ticks or clears the whole row. The
 * server checks all of them again, and that nobody builds a role with more
 * than they hold.
 *
 * EDIT ROLE IS THIS PAGE, FILLED IN (`EditRoleScreen`, a custom role's ⋮ →
 * Edit Role): the same grid and the same rules, because the server saves an
 * edited role exactly like a new one. No "Copy permissions from" -- the role
 * already has its own. Save and Cancel go back to the role's side panel.
 */

import { asProblem } from "@xpredict/api-client";
import { ErrorState } from "@xpredict/ui";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useShellContext } from "../../context";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import type { BuilderAction, BuilderRow } from "../api/roles";
import {
  useCreatePanelRole,
  usePanelRoles,
  useRoleBuilder,
  useUpdatePanelRole,
} from "../hooks/useRoles";
import styles from "./NewRoleScreen.module.css";

/** The fixed columns, in order. "update" is shown as Edit, as Zoho does. */
const COLUMNS = [
  { code: "view", label: "View" },
  { code: "create", label: "Create" },
  { code: "update", label: "Edit" },
  { code: "delete", label: "Delete" },
] as const;

function permissionsOf(row: BuilderRow): string[] {
  return row.actions.map((action) => action.permission);
}

function viewOf(row: BuilderRow): string | undefined {
  return row.actions.find((action) => action.code === "view")?.permission;
}

/** The role Edit Role opens with: what it is called and holds today. */
interface EditedRole {
  code: string;
  name: string;
  summary: string;
  permissions: string[];
}

export function NewRoleScreen() {
  return <RoleForm />;
}

/**
 * Edit Role: waits for the role and the grid, then opens the form filled in.
 * The role's permissions come from the builder's copy-from list, which holds
 * every one of this organisation's own roles.
 */
export function EditRoleScreen() {
  const { roleCode = "" } = useParams();
  const roles = usePanelRoles();
  const builder = useRoleBuilder();

  if (roles.isPending || builder.isPending) {
    return (
      <div className={styles.page}>
        <p className={styles.note}>Loading the role…</p>
      </div>
    );
  }
  if (roles.isError || builder.isError) {
    const failure = asProblem(roles.error ?? builder.error);
    return (
      <div className={styles.page}>
        <ErrorState
          title="Could not load this role"
          code={failure.code}
          traceId={failure.trace_id}
          onRetry={() => {
            void roles.refetch();
            void builder.refetch();
          }}
        />
      </div>
    );
  }

  const role = roles.data.find((r) => r.code === roleCode);
  const template = builder.data.templates.find((t) => t.code === roleCode);
  if (!role || role.built_in || !template) {
    return (
      <div className={styles.page}>
        <p className={styles.note}>
          {role?.built_in
            ? "Built-in roles cannot be changed."
            : "This role does not exist, or was deleted."}
        </p>
      </div>
    );
  }

  return (
    <RoleForm
      editing={{
        code: role.code,
        name: role.name,
        summary: role.summary,
        permissions: template.permissions,
      }}
    />
  );
}

function RoleForm({ editing }: { editing?: EditedRole }) {
  const { membership } = useShellContext();
  const navigate = useNavigate();
  const rolesPath = `/${membership.org_slug}/admin/admins-and-roles/roles`;
  // Where Save and Cancel go: the list after New Role, the role's panel after Edit.
  const backPath = editing ? `${rolesPath}/${editing.code}` : rolesPath;
  const { data: builder, isPending, isError, error, refetch } = useRoleBuilder();
  const { mutateAsync: create, isPending: creating } = useCreatePanelRole();
  const { mutateAsync: update, isPending: updating } = useUpdatePanelRole();
  const saving = creating || updating;

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.summary ?? "");
  const [held, setHeld] = useState<Set<string>>(() => new Set(editing?.permissions ?? []));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [nameError, setNameError] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ message: string; traceId?: string } | null>(null);

  /** Rule 5: ticking anything ticks View; unticking View clears the row. */
  function toggle(row: BuilderRow, action: BuilderAction) {
    setHeld((current) => {
      const next = new Set(current);
      if (next.has(action.permission)) {
        if (action.code === "view") {
          permissionsOf(row).forEach((code) => next.delete(code));
        } else {
          next.delete(action.permission);
        }
      } else {
        next.add(action.permission);
        const view = viewOf(row);
        if (view) next.add(view);
      }
      return next;
    });
  }

  /** Full: the whole row on, or off if it is all on already. */
  function toggleFull(row: BuilderRow) {
    setHeld((current) => {
      const next = new Set(current);
      const all = permissionsOf(row);
      const allOn = all.every((code) => next.has(code));
      all.forEach((code) => (allOn ? next.delete(code) : next.add(code)));
      return next;
    });
  }

  function copyFrom(code: string) {
    const template = builder?.templates.find((t) => t.code === code);
    setHeld(new Set(template?.permissions ?? []));
  }

  async function save() {
    setProblem(null);
    setNameError(null);
    if (!name.trim()) {
      setNameError("Enter a role name.");
      return;
    }
    if (held.size === 0) {
      setProblem({ message: "Tick at least one permission." });
      return;
    }
    const body = { name: name.trim(), description: description.trim(), permissions: [...held] };
    try {
      if (editing) {
        await update({ code: editing.code, body });
      } else {
        await create(body);
      }
      void navigate(backPath);
    } catch (failure) {
      const found = asProblem(failure);
      const fieldMessage = found.errors?.[0]?.detail;
      setProblem({
        message: fieldMessage ?? found.detail,
        traceId: found.status >= 500 ? found.trace_id : undefined,
      });
    }
  }

  const total = builder?.modules.reduce(
    (sum, module) => sum + module.rows.reduce((n, row) => n + row.actions.length, 0),
    0,
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{editing ? "Edit Role" : "New Role"}</h1>
      </header>

      <div className={styles.body}>
        {problem && <FormBanner traceId={problem.traceId}>{problem.message}</FormBanner>}

        <section aria-label="Role details" className={styles.card}>
          <div className={styles.pair}>
            <div className={styles.field}>
              <label htmlFor="role-name" className={styles.label}>
                Role name <span className={styles.required}>*</span>
              </label>
              <input
                id="role-name"
                type="text"
                maxLength={100}
                value={name}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "role-name-error" : undefined}
                onChange={(event) => setName(event.target.value)}
                className={styles.input}
              />
              {nameError && (
                <p id="role-name-error" className={styles.fieldError}>
                  {nameError}
                </p>
              )}
            </div>

            {!editing && (
              <div className={styles.field}>
                <label htmlFor="role-copy" className={styles.label}>
                  Copy permissions from
                </label>
                <select
                  id="role-copy"
                  className={styles.input}
                  defaultValue=""
                  onChange={(event) => copyFrom(event.target.value)}
                >
                  <option value="">Start blank</option>
                  {builder?.templates.map((template) => (
                    <option key={template.code} value={template.code}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="role-description" className={styles.label}>
              Description
            </label>
            <textarea
              id="role-description"
              rows={3}
              maxLength={500}
              placeholder="Max. 500 characters"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={styles.textarea}
            />
          </div>
        </section>

        <div className={styles.permissionsHeading}>
          <h2 className={styles.subtitle}>Permissions</h2>
          {total !== undefined && (
            <p className={styles.count} aria-live="polite">
              {held.size} of {total} permissions selected
            </p>
          )}
        </div>

        {isPending && <p className={styles.note}>Loading the Admin panel&rsquo;s pages…</p>}
        {isError && (
          <ErrorState
            title="Could not load the permissions"
            code={asProblem(error).code}
            traceId={asProblem(error).trace_id}
            onRetry={() => void refetch()}
          />
        )}

        {builder?.modules.map((module) => (
          <section key={module.code} aria-label={module.name} className={styles.moduleCard}>
            <h3 className={styles.moduleTitle}>{module.name}</h3>
            <div className={styles.tableScroll}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.particulars}>
                      Particulars
                    </th>
                    <th scope="col" className={styles.tick}>
                      Full
                    </th>
                    {COLUMNS.map((column) => (
                      <th key={column.code} scope="col" className={styles.tick}>
                        {column.label}
                      </th>
                    ))}
                    <th scope="col" className={styles.others}>
                      Others
                    </th>
                  </tr>
                </thead>
                {module.rows.map((row) => (
                  <GridRow
                    key={row.code}
                    row={row}
                    held={held}
                    open={!!open[row.code]}
                    onToggle={(action) => toggle(row, action)}
                    onFull={() => toggleFull(row)}
                    onOpen={() => setOpen((current) => ({ ...current, [row.code]: !current[row.code] }))}
                  />
                ))}
              </table>
            </div>
          </section>
        ))}

        <p className={styles.notice}>
          Ticking any action ticks View too: you cannot act on a page you cannot see. Unticking
          View clears the row.
        </p>
      </div>

      <footer className={styles.footer}>
        <Button type="button" isLoading={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void navigate(backPath)}>
          Cancel
        </Button>
      </footer>
    </div>
  );
}

interface GridRowProps {
  row: BuilderRow;
  held: Set<string>;
  open: boolean;
  onToggle: (action: BuilderAction) => void;
  onFull: () => void;
  onOpen: () => void;
}

/** One page or tab: its ticks, and its special actions when opened. */
function GridRow({ row, held, open, onToggle, onFull, onOpen }: GridRowProps) {
  const all = permissionsOf(row);
  const specials = row.actions.filter((action) => action.kind === "special");
  const specialsHeld = specials.filter((action) => held.has(action.permission)).length;
  const panelId = `more-${row.code}`;

  return (
    <tbody className={styles.rowGroup}>
      <tr>
        <th scope="row" className={styles.particulars}>
          {row.name}
        </th>
        <td className={styles.tick}>
          <input
            type="checkbox"
            checked={all.every((code) => held.has(code))}
            onChange={onFull}
            aria-label={`Full access to ${row.name}`}
          />
        </td>
        {COLUMNS.map((column) => {
          const action = row.actions.find((a) => a.kind === "basic" && a.code === column.code);
          return (
            <td key={column.code} className={styles.tick}>
              {action ? (
                <input
                  type="checkbox"
                  checked={held.has(action.permission)}
                  onChange={() => onToggle(action)}
                  aria-label={`${column.label} ${row.name}`}
                />
              ) : (
                <span className={styles.none} title="This page has no such action">
                  <span aria-hidden="true">—</span>
                  <span className={styles.visuallyHidden}>Not available</span>
                </span>
              )}
            </td>
          );
        })}
        <td className={styles.others}>
          {specials.length > 0 ? (
            <button
              type="button"
              className={styles.more}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={onOpen}
            >
              More Permissions{specialsHeld > 0 ? ` (${String(specialsHeld)})` : ""}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className={styles.chevron}
                data-open={open || undefined}
              >
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className={styles.none} aria-hidden="true">
              —
            </span>
          )}
        </td>
      </tr>
      {open && specials.length > 0 && (
        <tr id={panelId}>
          <td colSpan={7} className={styles.specialsCell}>
            <div className={styles.specials} role="group" aria-label={`More permissions for ${row.name}`}>
              {specials.map((action) => (
                <label key={action.code} className={styles.special}>
                  <input
                    type="checkbox"
                    checked={held.has(action.permission)}
                    onChange={() => onToggle(action)}
                  />
                  {action.name}
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}
