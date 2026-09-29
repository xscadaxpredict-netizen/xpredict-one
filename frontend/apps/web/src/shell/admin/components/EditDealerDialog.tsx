/**
 * Correct a dealership's details.
 *
 * Same nine fields as creating one — `DealerForm` — because they are the same
 * nine fields, and a separate edit form is how the two quietly stop agreeing
 * about what a valid phone number is.
 *
 * WHAT IT CANNOT CHANGE: status and headcount. Closing a dealership is its own
 * action with its own rule, and a payload that could carry `status` would make
 * "fix a typo in the address" and "shut the branch" the same request.
 *
 * NO PARENT DEALERSHIP. Dealers are a flat list (C29). This dialog used to
 * carry the fiddliest rule in the admin console — a dealership may not report
 * to itself or to one of its own branches — and all of it went with the field
 * when Q22 turned out to have no answer yet. It is in the history of
 * `feat/app-shell` if the tree comes back.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import type { Dealer } from "../api/dealers";
import { useUpdateDealer } from "../hooks/useDealers";
import { DealerForm, dealerToFields } from "./DealerForm";
import styles from "./DealerDialog.module.css";

interface EditDealerDialogProps {
  dealer: Dealer;
}

export function EditDealerDialog({ dealer }: EditDealerDialogProps) {
  const [open, setOpen] = useState(false);
  const { mutateAsync: update, isPending } = useUpdateDealer();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.secondaryTrigger}>
        <PencilIcon />
        Edit
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Edit dealer</Dialog.Title>
            <Dialog.Description className={styles.description}>
              Changing the name updates it everywhere it appears, including on the people
              scoped to this dealership.
            </Dialog.Description>
          </div>

          {/*
            `key` on the dealer AND on open: reopening starts from what is
            saved rather than from the abandoned edit, and picking a different
            dealership while this is mounted reseeds the fields.
          */}
          <DealerForm
            key={`${dealer.id}-${String(open)}`}
            defaultValues={dealerToFields(dealer)}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            isPending={isPending}
            onSubmit={async (details) => {
              await update({ dealerId: dealer.id, body: details });
              setOpen(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11.2 2.3a1.6 1.6 0 0 1 2.3 2.3l-7.4 7.4-3 .7.7-3z" />
      <path d="M10.2 3.3l2.3 2.3" />
    </svg>
  );
}
