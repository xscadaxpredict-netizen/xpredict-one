import { SignaturePad } from "./SignaturePad";
import styles from "./ServiceReportModal.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  form: any;
  confirmedSites: any[];
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function ServiceReportModal({ isOpen, isEditing, form, confirmedSites, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Service Report" : "Log New Service Report"}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={onSubmit} className={styles.formContainer}>
          <div className={styles.modalBody}>
            {/* 1. Select Site & Zone */}
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

            {/* 1.5 Zone Selection */}
            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Service Zone <span className={styles.required}>*</span></label>
                <select 
                  required 
                  className={styles.input}
                  value={form.zone}
                  onChange={e => onFormChange({ zone: e.target.value })}
                >
                  <option value="North Zone">North Zone (Delhi NCR / UP / Punjab)</option>
                  <option value="South Zone">South Zone (Tamil Nadu / Kerala / KA)</option>
                  <option value="East Zone">East Zone (WB / Odisha / Bihar)</option>
                  <option value="West Zone">West Zone (Maharashtra / Gujarat)</option>
                  <option value="Central Zone">Central Zone (MP / Chhattisgarh)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              {form.zone === "Other" && (
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Custom Zone <span className={styles.required}>*</span></label>
                  <input 
                    required
                    type="text"
                    placeholder="Enter custom zone"
                    className={styles.input}
                    value={form.customZone}
                    onChange={e => onFormChange({ customZone: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* 2. Tech & Date */}
            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Technician <span className={styles.required}>*</span></label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. Ramesh"
                  className={styles.input}
                  value={form.technician}
                  onChange={e => onFormChange({ technician: e.target.value, servicePersonName: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Service Date <span className={styles.required}>*</span></label>
                <input 
                  required
                  type="date"
                  className={styles.input}
                  value={form.date}
                  onChange={e => onFormChange({ date: e.target.value })}
                />
              </div>
            </div>

            {/* 3. Remarks */}
            <div>
              <label className={styles.label}>Service Remarks / Details <span className={styles.required}>*</span></label>
              <textarea 
                required
                rows={3}
                placeholder="Describe the maintenance performed..."
                className={styles.input}
                value={form.remarks}
                onChange={e => onFormChange({ remarks: e.target.value })}
              />
            </div>

            {/* 3.5 Attachments */}
            <div>
              <label className={styles.label}>Attachments & Photos</label>
              <input 
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                className={styles.input}
              />
            </div>

            {/* 4. Signatures Box */}
            <div className={styles.signatureBox}>
              <h4 className={styles.signatureBoxTitle}>Signatures</h4>
              <div className={styles.signatureStack}>
                <div className={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>Service Person Name <span className={styles.required}>*</span></label>
                    <input 
                      required
                      type="text"
                      className={styles.input}
                      value={form.servicePersonName}
                      onChange={e => onFormChange({ servicePersonName: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SignaturePad 
                      label="Service Person Signature" 
                      isRequired={true} 
                      value={form.servicePersonSignature} 
                      onChange={(val: string) => onFormChange({ servicePersonSignature: val })}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>Client Name <span className={styles.required}>*</span></label>
                    <input 
                      required
                      type="text"
                      className={styles.input}
                      value={form.clientName}
                      onChange={e => onFormChange({ clientName: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SignaturePad 
                      label="Client Signature" 
                      isRequired={false} 
                      value={form.clientSignature} 
                      onChange={(val: string) => onFormChange({ clientSignature: val })}
                    />
                  </div>
                </div>
              </div>
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
