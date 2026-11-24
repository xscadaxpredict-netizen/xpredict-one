/**
 * Delete, on DMS settings -> Users (the owner, 2026-11-24): TAKE DMS AWAY,
 * not the person. They stay in the organisation with their other apps, and
 * their name stays on the DMS records they made. A pending person added only
 * for DMS has their invitation cancelled -- there is nothing left to join.
 *
 * Asks first, in the Admin panel's Delete dialog's words and styles, and
 * offers Deactivate as the undoable alternative.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../../shell/components/Button";
import { FormBanner } from "../../../shell/components/FormBanner";
import styles from "../../../shell/admin/components/RemoveUserDialog.module.css";
import type { AppUser } from "./api";
import { useRemoveDmsUser } from "./useDmsUsers";

interface RemoveDmsUserDialogProps {
  user: AppUser;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}

export function RemoveDmsUserDialog({
  user,
  name,
  open,
  onOpenChange,
  onRemoved,
}: RemoveDmsUserDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: remove, isPending } = useRemoveDmsUser();
  const isPendingPerson = user.status === "pending";

  async function onConfirm() {
    setError(null);
    try {
      await remove(user.id);
      onOpenChange(false);
      onRemoved();
    } catch (caught) {
      setError(asProblem(caught).detail);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setError(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Title className={styles.title}>Remove {name} from DMS?</Dialog.Title>

          <Dialog.Description className={styles.description}>
            {isPendingPerson ? (
              <>
                <strong>{user.email}</strong> has not joined yet. DMS comes off their invitation;
                if DMS was all they were invited to, the invitation is cancelled and their link
                stops working.
              </>
            ) : (
              <>
                <strong>{name}</strong> loses DMS immediately. They stay in the organisation with
                their other apps, and their name stays on the DMS records they created.
              </>
            )}
          </Dialog.Description>

          {!isPendingPerson && (
            <p className={styles.alternative}>
              To switch DMS off without removing it, use <strong>Deactivate</strong> instead —
              that can be undone.
            </p>
          )}

          {error && <FormBanner>{error}</FormBanner>}

          <div className={styles.actions}>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Keep them
              </Button>
            </Dialog.Close>
            <button
              type="button"
              className={styles.confirm}
              disabled={isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? "Removing…" : "Remove from DMS"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
