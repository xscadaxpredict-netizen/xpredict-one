import { useEffect, useRef } from "react";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  intent = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleCancel = (e: React.MouseEvent | React.SyntheticEvent) => {
    e.preventDefault();
    onCancel();
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <dialog 
      ref={dialogRef} 
      className={styles.dialog}
      onCancel={handleCancel}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
      </div>
      <div className={styles.body}>
        {message}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.btnSecondary} onClick={handleCancel}>
          {cancelLabel}
        </button>
        <button 
          type="button" 
          className={`${styles.btnPrimary} ${intent === "danger" ? styles.btnDanger : ""}`} 
          onClick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
