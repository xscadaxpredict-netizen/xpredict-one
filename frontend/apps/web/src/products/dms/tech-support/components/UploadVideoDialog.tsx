import { XIcon } from "lucide-react";
import styles from "./UploadVideoDialog.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  form: any;
  onFormChange: (updates: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function UploadVideoDialog({ isOpen, isEditing, form, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Video" : "Upload Video"}</h3>
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
                <option value="Maintenance">Maintenance</option>
                <option value="Installation">Installation</option>
                <option value="Troubleshooting">Troubleshooting</option>
                <option value="Operation">Operation</option>
              </select>
              
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Duration</label>
                  <input required className={styles.input} value={form.duration || ""} onChange={e => onFormChange({ duration: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Resolution</label>
                  <input required className={styles.input} value={form.resolution || ""} onChange={e => onFormChange({ resolution: e.target.value })} />
                </div>
              </div>

              <label className={styles.label}>Description</label>
              <textarea className={styles.input} rows={3} value={form.description || ""} onChange={e => onFormChange({ description: e.target.value })} />

              <label className={styles.label} style={{ marginTop: '0.25rem' }}>Upload Video File *</label>
              <div style={{ border: '1px dashed var(--color-border-strong)', padding: '1.5rem', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--color-text-2)' }}>
                <input type="file" accept="video/mp4,video/x-m4v,video/*" required style={{ display: 'block', margin: '0 auto' }} />
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--color-text-3)' }}>Supports MP4 videos up to 500MB</div>
              </div>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>Save Video</button>
          </div>
        </form>
      </div>
    </div>
  );
}
