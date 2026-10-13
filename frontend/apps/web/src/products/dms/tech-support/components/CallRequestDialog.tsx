import { XIcon } from "lucide-react";
import styles from "./CallRequestDialog.module.css";

interface Props {
  isOpen: boolean;
  form: any;
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function CallRequestDialog({ isOpen, form, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Request a Tech Support Call</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formStack}>
              <label className={styles.label}>
                  Phone Number <span style={{ color: "red" }}>*</span>
              </label>
              <input required type="tel" className={styles.input} value={form.phone || ""} onChange={e => onFormChange({ phone: e.target.value })} placeholder="Enter your contact number..." />

              <label className={styles.label}>
                  Reason / Detailed Description of Issue <span style={{ color: "red" }}>*</span>
              </label>
              <textarea required className={styles.input} rows={4} value={form.message || ""} onChange={e => onFormChange({ message: e.target.value })} placeholder="Describe the symptoms, error codes, or required assistance..." />

              <label className={styles.label}>
                  Attachments (Optional)
              </label>
              <input type="file" className={styles.input} onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  onFormChange({ attachment: e.target.files[0] });
                }
              }} />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  );
}

