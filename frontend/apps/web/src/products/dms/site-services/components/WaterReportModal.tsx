import { XIcon } from "lucide-react";
import styles from "./WaterReportModal.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  form: any;
  confirmedSites: any[];
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function WaterReportModal({ isOpen, isEditing, form, confirmedSites, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Water Report" : "Log New Water Report"}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className={styles.formContainer}>
          <div className={styles.modalBody}>
            {/* Zone Filter & Site */}
            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Zone (Pincode Filter)</label>
                <input 
                  type="text"
                  placeholder="Enter pincode..."
                  className={styles.input}
                  value={form.zonePincode}
                  onChange={e => onFormChange({ zonePincode: e.target.value, siteId: "" })}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label className={styles.label}>Select Site <span className={styles.required}>*</span></label>
                <select 
                  required 
                  className={styles.input}
                  value={form.siteId}
                  onChange={e => onFormChange({ siteId: e.target.value })}
                >
                  <option value="">-- Choose Deployed Customer Site --</option>
                  {confirmedSites
                    .filter(s => !form.zonePincode || s.pincode === form.zonePincode || (s.address && s.address.includes(form.zonePincode)))
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.customer_name} ({s.oc_number || 'No OC'})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={styles.label}>Date Tested <span className={styles.required}>*</span></label>
              <input 
                required
                type="date"
                className={styles.input}
                value={form.date}
                onChange={e => onFormChange({ date: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.label}>Upload Report File (Optional)</label>
              <input 
                type="file"
                className={styles.input}
                onChange={e => onFormChange({ attachment: e.target.files?.[0]?.name || '' })}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>{isEditing ? "Save Changes" : "Save Report"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
