import { XIcon } from "lucide-react";
import { useSitePeople } from "../hooks/useSiteServices";
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
  // The people who can take this site's visit: its own dealership's (or, for
  // the organisation's own site, the organisation's) active DMS users.
  const { data: people, isLoading: peopleLoading } = useSitePeople(isOpen ? form.siteId : undefined);
  if (!isOpen) return null;
  const knownPerson = !form.technicianUserId || (people ?? []).some((p) => p.user_id === form.technicianUserId);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>{form.mode === "reschedule" ? "Reschedule Visit" : "Schedule Service Visit"}</h3>
            <p className={styles.modalSubtitle}>
              {form.mode === "reschedule"
                ? "The same visit goes back on the schedule on the new date. Its cancellation stays in its history."
                : "Assign maintenance date, technician, and service interval."}
            </p>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>

        <form onSubmit={onSubmit} className={styles.formContainer}>
          <div className={styles.modalBody}>
            <div>
              <label className={styles.label}>
                              Select Site <span className={styles.required}>*</span>
                          </label>
              <select 
                required 
                className={styles.input}
                value={form.siteId}
                disabled={Boolean(form.lockSite)}
                onChange={e => onFormChange({ siteId: e.target.value, technicianUserId: "" })}
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
                disabled={form.mode === "reschedule"}
                value={form.serviceType}
                onChange={e => onFormChange({ serviceType: e.target.value })}
              >
                <option value="Routine Preventive Maintenance (PMS)">Routine Preventive Maintenance (PMS)</option>
                <option value="Emergency Breakdown Inspection">Emergency Breakdown Inspection</option>
              </select>
            </div>

            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>
                                  {form.mode === "reschedule" ? "New Date" : "Scheduled Date"} <span className={styles.required}>*</span>
                              </label>
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
                <select
                  className={styles.input}
                  value={form.technicianUserId || ""}
                  disabled={!form.siteId || peopleLoading}
                  onChange={e => onFormChange({ technicianUserId: e.target.value })}
                >
                  <option value="">
                    {!form.siteId ? "Choose a site first" : peopleLoading ? "Loading people..." : "— Unassigned —"}
                  </option>
                  {!knownPerson && (
                    <option value={form.technicianUserId}>{form.technicianName || "Current technician"} (no longer available)</option>
                  )}
                  {(people ?? []).map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.name} · {p.email}</option>
                  ))}
                </select>
                {form.siteId && !peopleLoading && (people ?? []).length === 0 && (
                  <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "4px" }}>
                    Nobody in this site's dealership has DMS access yet. Invite them in Administration → Users.
                  </div>
                )}
                {form.legacyTechnician && !form.technicianUserId && (
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-3)", marginTop: "4px" }}>
                    Previously typed as “{form.legacyTechnician}”. Pick the person to assign it properly.
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className={styles.label}>Notes</label>
              <textarea 
                rows={2}
                placeholder="Special instructions..."
                disabled={form.mode === "reschedule"}
                className={styles.input}
                value={form.notes}
                onChange={e => onFormChange({ notes: e.target.value })}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>{form.mode === "reschedule" ? "Reschedule Visit" : "Save Schedule"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
