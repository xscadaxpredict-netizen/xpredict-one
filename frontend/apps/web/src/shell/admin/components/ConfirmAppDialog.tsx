/**
 * "Are you sure?" before the app tile's Disable or Unassign (the owner,
 * 2026-11-20, Zoho's wording): a warning sign, the question, "Yes, <verb>" and
 * Cancel.
 *
 * RADIX, NOT `@xpredict/ui`'s ConfirmDialog. That one is a native `<dialog>`,
 * which jsdom cannot open (no `showModal`) and which sits in the browser's top
 * layer beside the side panel's Radix focus trap. This keeps every Admin
 * panel dialog on one mechanism, and the request runs while it is open, so a
 * refusal is shown here instead of after it has closed.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { asProblem } from "@xpredict/api-client";

import { Button } from "../../components/Button";
import { FormBanner } from "../../components/FormBanner";
import styles from "./RemoveUserDialog.module.css";
import own from "./ConfirmAppDialog.module.css";

interface ConfirmAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For screen readers: "Disable DMS". The question is what is shown. */
  title: string;
  question: string;
  /** "Disable" -> "Yes, Disable". */
  verb: string;
  /** The request. The dialog closes when it succeeds and shows why when it does not. */
  onConfirm: () => Promise<unknown>;
}

export function ConfirmAppDialog({
  open,
  onOpenChange,
  title,
  question,
  verb,
  onConfirm,
}: ConfirmAppDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (failure) {
      setError(asProblem(failure).detail);
    } finally {
      setPending(false);
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
          <Dialog.Title className={own.hidden}>{title}</Dialog.Title>
          <div className={own.question}>
            <WarningIcon />
            <Dialog.Description className={own.text}>{question}</Dialog.Description>
          </div>

          {error && <FormBanner>{error}</FormBanner>}

          <div className={own.actions}>
            <Button type="button" isLoading={pending} onClick={() => void confirm()}>
              {pending ? "Working…" : `Yes, ${verb}`}
            </Button>
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WarningIcon() {
  return (
    <svg
      className={own.icon}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
