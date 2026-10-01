import { XIcon } from "lucide-react";
import styles from "./ScheduleModal.module.css";

interface Props {
  isOpen: boolean;
  form: any;
  confirmedSites: any[];
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function ScheduleModal({ isOpen, form, confirmedSites, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Schedule Service Visit</h3>
            <p className={styles.modalSubtitle}>Assign maintenance date, technician, and service interval.</p>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>

        <form onSubmit={onSubmit} className={styles.formContainer}>
          <div className={styles.modalBody}>
            <div>
              <label className={styles.label}>Select Site <span className={styles.required}>*</span></label>
              <select 
                required 
                className={styles.input}
                value={form.siteId}
                onChange={e => onFormChange({ siteId: e.target.value })}
              >
                <option value="">-- Choose Deployed Customer Site --</option>
                {confirmedSites.map(s => (
                  <option key={s.id} value={s.id}>{s.customer_name} ({s.oc_number || 'No OC'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className={styles.label}>Service Type <span className={styles.required}>*</span></label>
              <select 
                className={styles.input}
                value={form.serviceType}
                onChange={e => onFormChange({ serviceType: e.target.value })}
              >
                <option value="Routine Preventive Maintenance (PMS)">Routine Preventive Maintenance (PMS)</option>
                <option value="Emergency Breakdown Inspection">Emergency Breakdown Inspection</option>
              </select>
            </div>

            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Scheduled Date <span className={styles.required}>*</span></label>
                <input 
                  required
                  type="date"
                  className={styles.input}
                  value={form.scheduledDate}
                  onChange={e => onFormChange({ scheduledDate: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Assigned Technician</label>
                <input 
                  type="text"
                  placeholder="e.g. Ramesh"
                  className={styles.input}
                  value={form.technician}
                  onChange={e => onFormChange({ technician: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className={styles.label}>Notes</label>
              <textarea 
                rows={2}
                placeholder="Special instructions..."
                className={styles.input}
                value={form.notes}
                onChange={e => onFormChange({ notes: e.target.value })}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>Save Schedule</button>
          </div>
        </form>
      </div>
    </div>
  );
}
