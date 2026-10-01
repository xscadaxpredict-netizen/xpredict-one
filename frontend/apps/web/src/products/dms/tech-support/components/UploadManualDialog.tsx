import { XIcon } from "lucide-react";
import styles from "./UploadManualDialog.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  form: any;
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function UploadManualDialog({ isOpen, isEditing, form, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Manual" : "Upload Manual"}</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className={styles.modalBody}>
            <div className={styles.formStack}>
              <label className={styles.label}>Title</label>
              <input required className={styles.input} value={form.title || ""} onChange={e => onFormChange({ title: e.target.value })} />
              
              <label className={styles.label}>Category *</label>
              <select required className={styles.input} value={form.category || ""} onChange={e => onFormChange({ category: e.target.value })}>
                <option value="" disabled>Select a category...</option>
                <option value="RO Plants">RO Plants</option>
                <option value="Water Softeners">Water Softeners</option>
                <option value="UV Systems">UV Systems</option>
                <option value="Automation / PLC">Automation / PLC</option>
                <option value="Chemical Dosing">Chemical Dosing</option>
              </select>
              
              <label className={styles.label}>Description</label>
              <textarea className={styles.input} rows={3} value={form.description || ""} onChange={e => onFormChange({ description: e.target.value })} />

              <label className={styles.label} style={{ marginTop: '0.25rem' }}>Upload Document *</label>
              <div style={{ border: '1px dashed var(--color-border-strong)', padding: '1.5rem', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--color-text-2)' }}>
                <input type="file" required style={{ display: 'block', margin: '0 auto' }} />
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--color-text-3)' }}>Supports PDF documents up to 25MB</div>
              </div>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>Save Manual</button>
          </div>
        </form>
      </div>
    </div>
  );
}
