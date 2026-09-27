/**
 * Take somebody out of the organisation.
 *
 * IT IS NOT "DELETE USER", and the wording matters because the difference is
 * real. A person's account lives in the control database and may belong to
 * other organisations (C1); this removes the MEMBERSHIP — their relationship
 * with this one. They lose access here and keep their account.
 *
 * Which also means their name stays on what they did: an enquiry raised by
 * A. Fernandes still says so after she leaves. Anything that erased that would
 * either orphan the history or take it with her, and neither is something an
 * organisation admin should be able to do from a menu.
 *
 * TWO DIFFERENT ACTS BEHIND ONE BUTTON, and the dialog says which is which:
 * for somebody who never accepted there is no account and nothing references
 * them, so it is simply cancelling an invitation. For everybody else it is
 * revoking access to work that outlives them.
 *
 * Confirmed rather than instant. It cannot be undone — re-inviting is a new
 * invitation they must accept again — and it sits in the same menu as
 * "mark as inactive", which is the reversible one a misclick should land on.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import type { OrgUser } from "../api/users";
import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import { useRemoveUser } from "../hooks/useUsers";
import styles from "./RemoveUserDialog.module.css";

interface RemoveUserDialogProps {
  user: OrgUser;
  orgName: string;
  /** Closes the detail panel: the record it was showing no longer exists. */
  onRemoved: () => void;
}

export function RemoveUserDialog({ user, orgName, onRemoved }: RemoveUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: remove, isPending } = useRemoveUser();

  const isInvited = user.status === "invited";
  const fullName = `${user.first_name} ${user.last_name}`;

  async function onConfirm() {
    setError(null);

    try {
      await remove(user.id);
      setOpen(false);
      onRemoved();
    } catch (caught) {
      setError(asProblem(caught).detail);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <Dialog.Trigger className={styles.trigger}>
        {isInvited ? "Cancel invitation" : "Remove from organisation"}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Title className={styles.title}>
            {isInvited ? "Cancel this invitation?" : `Remove ${fullName}?`}
          </Dialog.Title>

          <Dialog.Description className={styles.description}>
            {isInvited ? (
              <>
                <strong>{user.email}</strong> has not accepted yet. Cancelling removes the
                invitation — they will not be able to use the link, and you can invite them
                again later.
              </>
            ) : (
              <>
                <strong>{fullName}</strong> loses access to {orgName} immediately. Their
                account is not deleted, and their name stays on the records they created.
              </>
            )}
          </Dialog.Description>

          {!isInvited && (
            <p className={styles.alternative}>
              To stop them signing in without removing them, use{" "}
              <strong>Mark as inactive</strong> instead — that can be undone.
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
              {isPending
                ? "Removing…"
                : isInvited
                  ? "Cancel invitation"
                  : "Remove from organisation"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
