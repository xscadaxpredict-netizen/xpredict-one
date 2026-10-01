/**
 * Add Follow-up dialog — small modal with remarks + next date.
 */

import { useEffect, useRef, useState } from "react";
import type { NewFollowup } from "../api/types";
import styles from "./FollowupDialog.module.css";

interface FollowupDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: NewFollowup) => void;
  isPending: boolean;
}

export function FollowupDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: FollowupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [remarks, setRemarks] = useState("");
  const [nextDate, setNextDate] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setRemarks("");
      setNextDate("");
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ remarks, next_followup_date: nextDate });
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.header}>
        <h2 className={styles.title}>Add Follow-up</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="fu-remarks">
              Follow-up Discussion / Remarks
            </label>
            <textarea
              id="fu-remarks"
              required
              className={styles.textarea}
              rows={3}
              placeholder="What was discussed or needs to be done?"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="fu-date">
              Next Follow-up Date
            </label>
            <input
              id="fu-date"
              required
              type="date"
              className={styles.input}
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save Follow-up"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
