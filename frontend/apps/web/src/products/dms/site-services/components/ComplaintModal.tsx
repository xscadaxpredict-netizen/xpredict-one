import { XIcon } from "lucide-react";
import styles from "./ComplaintModal.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  form: any;
  confirmedSites: any[];
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function ComplaintModal({ isOpen, isEditing, form, confirmedSites, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Complaint" : "Log a New Complaint"}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className={styles.formContainer}>
          <div className={styles.modalBody}>
            
            {/* Prefetched Read-Only Details */}
            <div className={styles.prefetchBox}>
              <div>
                <span className={styles.prefetchLabel}>Site / Customer</span>
                <strong>{confirmedSites[0]?.customer_name || "TechCorp Solutions"} (OC: {confirmedSites[0]?.oc_number || "OC-1001"})</strong>
              </div>
              <div>
                <span className={styles.prefetchLabel}>Pincode / Zone</span>
                <strong>{confirmedSites[0]?.pincode || "560066"}</strong>
              </div>
              <div>
                <span className={styles.prefetchLabel}>Logged In User</span>
                <strong>Siddarth (Admin)</strong>
              </div>
              <div>
                <span className={styles.prefetchLabel}>Date of Entry</span>
                <strong>{new Date().toLocaleDateString()}</strong>
              </div>
            </div>

            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Service Person Name (Optional)</label>
                <input 
                  type="text"
                  placeholder="Assignee name if required..."
                  className={styles.input}
                  value={form.servicePersonName}
                  onChange={e => onFormChange({ servicePersonName: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Attachment (Optional)</label>
                <input 
                  type="file"
                  className={styles.input}
                  style={{ background: "var(--color-surface)", padding: "5px" }}
                />
              </div>
            </div>

            <div>
              <label className={styles.label}>Describe the Issue <span className={styles.required}>*</span></label>
              <textarea 
                required
                rows={4}
                placeholder="E.g. low pressure, leaks, strange noise..."
                className={styles.input}
                style={{ resize: "vertical" }}
                value={form.issue}
                onChange={e => onFormChange({ issue: e.target.value })}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnDanger}>{isEditing ? "Save Changes" : "Submit Complaint"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
