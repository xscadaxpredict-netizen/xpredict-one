/**
 * The app tile's Edit (the owner, 2026-11-20, Zoho's 'Assign "Name"'): the
 * role a person holds in ONE app, and nothing else.
 *
 * ONLY ROLES THAT FIT WHERE THEY SIT: an organisation-wide person is offered
 * organisation-level roles, somebody at a dealership the dealership roles
 * (C27). Their place does not change here. The server checks the same rule.
 *
 * Laid out like Assign applications' second step, so the two read as one
 * thing: the app's badge and name, the role, and "Create a new role" greyed.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { findApp } from "../../navigation";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { rolesFor } from "../api/roles";
import type { OrgUser, UserAppRole } from "../api/users";
import { useRoles } from "../hooks/useRoles";
import { useChangeAppRole } from "../hooks/useUsers";
import { RolePicker } from "./RolePicker";
import { displayName } from "./UserActions";
import dialog from "./InviteUserDialog.module.css";
import styles from "./AssignAppsDialog.module.css";

interface EditAppDialogProps {
  user: OrgUser;
  grant: UserAppRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAppDialog({ user, grant, open, onOpenChange }: EditAppDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={dialog.dialog} aria-describedby={undefined}>
          {/* Remounted on each open, so it starts from the role they hold. */}
          {open && <EditApp user={user} grant={grant} onDone={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditApp({
  user,
  grant,
  onDone,
}: {
  user: OrgUser;
  grant: UserAppRole;
  onDone: () => void;
}) {
  const { data: roles = [] } = useRoles();
  const { mutateAsync: change, isPending } = useChangeAppRole();
  const [role, setRole] = useState(grant.role_code);
  const [error, setError] = useState<{ message: string; traceId?: string } | null>(null);

  const app = findApp(grant.app);
  const appName = app?.name ?? grant.app;
  // At a dealership only inside DMS, the one app with dealerships (C27).
  const atDealership = grant.app === "dms" && user.unit_id !== null;
  const options = rolesFor(roles, grant.app, atDealership);

  async function save() {
    setError(null);
    if (role === grant.role_code) {
      onDone();
      return;
    }
    try {
      await change({ userId: user.id, app: grant.app, role });
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
          <Dialog.Title className={dialog.title}>Edit {appName}</Dialog.Title>
          <p className={dialog.description}>for {displayName(user)}</p>
        </div>
        <Dialog.Close className={styles.iconButton} aria-label="Close">
          <CloseIcon />
        </Dialog.Close>
      </div>

      <div className={dialog.body}>
        {error && <FormBanner traceId={error.traceId}>{error.message}</FormBanner>}

        <div className={styles.roleRow}>
          <RolePicker
            appName={appName}
            appKey={grant.app}
            options={options}
            value={role}
            onChange={setRole}
          />
          <button type="button" className={styles.later} aria-disabled="true" title="Coming later">
            Create a new role
          </button>
        </div>

        <p className={styles.notice}>
          {atDealership
            ? `Roles for somebody at ${user.unit_name ?? "a dealership"}. Where they work does not change here.`
            : "Roles that apply across your whole organisation."}
        </p>
      </div>

      <div className={dialog.actions}>
        <Dialog.Close asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="button" isLoading={isPending} disabled={!role} onClick={() => void save()}>
          {isPending ? "Updating…" : "Update"}
        </Button>
      </div>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
