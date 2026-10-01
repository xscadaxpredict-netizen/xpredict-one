import { XIcon } from "lucide-react";
import styles from "./RejectOrderDialog.module.css";

interface Props {
  isOpen: boolean;
  reason: string;
  onReasonChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function RejectOrderDialog({ isOpen, reason, onReasonChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Reject Order</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit}>
          <div className={styles.modalBody}>
            <label className={styles.label}>Reason for Rejection *</label>
            <textarea
              required
              className={styles.textarea}
              rows={3}
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              placeholder="E.g. Item out of stock, incorrect pricing..."
            />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnDanger}>Confirm Rejection</button>
          </div>
        </form>
      </div>
    </div>
  );
}
