/**
 * Admins -> an admin's ⋮ -> Manage Roles (the owner, 2026-11-23): change the
 * ONE Admin panel role they hold (C89). Their current role is chosen to start
 * with; a role granting more than you hold is greyed, as in Assign Admin.
 *
 * Radix, like every Admin panel dialog (C85): the request runs while it is
 * open, so the server's refusal is shown here. NONE OF THIS IS SECURITY: the
 * server applies every rule again.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import type { Admin } from "../api/admins";
import { useChangeAdminRole } from "../hooks/useAdmins";
import { usePanelRoles } from "../hooks/useRoles";
import page from "../screens/NewRoleScreen.module.css";
import styles from "./EditUserDialog.module.css";
import { displayName } from "./UserActions";

interface ManageRolesDialogProps {
  admin: Admin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageRolesDialog({ admin, open, onOpenChange }: ManageRolesDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          {/* Remounted on each open, so last time's choice does not linger. */}
          {open && <ManageRoles admin={admin} onDone={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ManageRoles({ admin, onDone }: { admin: Admin; onDone: () => void }) {
  const roles = usePanelRoles();
  const { mutateAsync: change, isPending } = useChangeAdminRole();
  const [role, setRole] = useState(admin.admin_role.code);
  const [problem, setProblem] = useState<string | null>(null);

  const name = displayName(admin);
  const offered = (roles.data ?? []).filter((r) => r.code !== "owner");
  const unchanged = role === admin.admin_role.code;

  async function save() {
    setProblem(null);
    try {
      await change({ personId: admin.id, role });
      onDone();
    } catch (failure) {
      setProblem(asProblem(failure).detail);
    }
  }

  return (
    <>
      <div className={styles.header}>
        <Dialog.Title className={styles.title}>Manage Roles</Dialog.Title>
        <Dialog.Description className={styles.description}>
          {name}&rsquo;s role in the Admin panel. They can do only what the role allows.
        </Dialog.Description>
      </div>

      <div className={styles.body}>
        {problem && <FormBanner>{problem}</FormBanner>}
        <div className={page.field}>
          <label htmlFor="manage-role" className={page.label}>
            Role <span className={page.required}>*</span>
          </label>
          <select
            id="manage-role"
            className={page.input}
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {roles.isPending && <option value={role}>{admin.admin_role.name}</option>}
            {offered.map((r) => (
              <option
                key={r.code}
                value={r.code}
                // Their current role stays choosable, so the select shows it.
                disabled={!r.grantable && r.code !== admin.admin_role.code}
              >
                {r.grantable || r.code === admin.admin_role.code
                  ? r.name
                  : `${r.name} — more than you hold`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.actions}>
        <Dialog.Close asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Dialog.Close>
        <Button
          type="button"
          isLoading={isPending}
          disabled={unchanged}
          onClick={() => void save()}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}
