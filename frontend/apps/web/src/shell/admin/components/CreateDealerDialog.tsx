/**
 * Open a new dealership.
 *
 * Thin: the nine fields and their rules are `DealerForm`, shared with editing.
 * All this decides is what a new dealership may report to and what the buttons
 * say.
 *
 * Creating a dealer is an organisation-level act (C3): the organisation opens
 * and closes dealerships, and each one then manages its own people (C23).
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { useCreateDealer, useDealers } from "../hooks/useDealers";
import { DealerForm, EMPTY_DEALER_FIELDS } from "./DealerForm";
import styles from "./DealerDialog.module.css";

export function CreateDealerDialog() {
  const [open, setOpen] = useState(false);
  const { mutateAsync: create, isPending } = useCreateDealer();
  const { data: dealers } = useDealers();

  /*
   * Only open dealerships can be a parent. Hanging a new branch under one
   * that has closed creates something whose parent cannot act for it.
   *
   * No cycle to worry about here — a dealership that does not exist yet
   * cannot be its own ancestor. Editing is where that bites.
   */
  const parentOptions = dealers?.filter((dealer) => dealer.status === "active") ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger}>
        <PlusIcon />
        Add dealer
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Add dealer</Dialog.Title>
            <Dialog.Description className={styles.description}>
              A dealership divides DMS only. People scoped to it see its records; CRM and
              the rest stay organisation-wide.
            </Dialog.Description>
          </div>

          {/*
            Remounted each time it opens, via `key`. Without it the form keeps
            whatever was typed and whichever error was showing the last time it
            was closed — which after nine fields is a lot to inherit.
          */}
          <DealerForm
            key={String(open)}
            defaultValues={EMPTY_DEALER_FIELDS}
            parentOptions={parentOptions}
            submitLabel="Add dealer"
            pendingLabel="Adding…"
            isPending={isPending}
            onSubmit={async (details) => {
              await create(details);
              setOpen(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="M7 2.5v9M2.5 7h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
