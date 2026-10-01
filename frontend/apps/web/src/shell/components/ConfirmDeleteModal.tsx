import { AlertTriangleIcon } from "lucide-react";
import styles from "./ConfirmDeleteModal.module.css";

interface Props {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ 
  isOpen, 
  title = "Delete Confirmation", 
  message = "Are you sure you want to delete this? This action cannot be undone and once deleted, the data cannot be restored.", 
  onConfirm, 
  onCancel 
}: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <AlertTriangleIcon size={18} /> {title}
          </h3>
        </div>
        <div className={styles.body}>
          {message}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.btnDelete} onClick={() => { onConfirm(); onCancel(); }}>Yes, Delete</button>
        </div>
      </div>
    </div>
  );
}
