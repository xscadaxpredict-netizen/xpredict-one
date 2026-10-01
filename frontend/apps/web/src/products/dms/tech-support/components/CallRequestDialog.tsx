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
              <label className={styles.label}>Full Name</label>
              <input required className={styles.input} value={form.name || ""} onChange={e => onFormChange({ name: e.target.value })} />
              
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Phone Number</label>
                  <input required type="tel" className={styles.input} value={form.phone || ""} onChange={e => onFormChange({ phone: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Email Address</label>
                  <input required type="email" className={styles.input} value={form.email || ""} onChange={e => onFormChange({ email: e.target.value })} />
                </div>
              </div>

              <label className={styles.label}>Subject / Machine Component</label>
              <input required className={styles.input} value={form.subject || ""} onChange={e => onFormChange({ subject: e.target.value })} placeholder="E.g. HPP Pump noise, Panel showing fault..." />

              <label className={styles.label}>Detailed Description of Issue</label>
              <textarea required className={styles.input} rows={4} value={form.message || ""} onChange={e => onFormChange({ message: e.target.value })} placeholder="Describe the symptoms, error codes, or required assistance..." />
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
