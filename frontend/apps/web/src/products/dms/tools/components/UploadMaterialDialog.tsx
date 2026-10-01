import { XIcon } from "lucide-react";
import type { MaterialType } from "../api/types";
import styles from "./UploadMaterialDialog.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  type: MaterialType;
  form: any;
  onFormChange: (updates: any) => void;
  onTypeChange?: (type: MaterialType) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function UploadMaterialDialog({ isOpen, isEditing, type, form, onFormChange, onTypeChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  const typeName = type === "brochure" ? "Brochure" : type === "video" ? "Video" : "Ad Banner";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? `Edit ${typeName}` : `Upload ${typeName}`}</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className={styles.modalBody}>
            <div className={styles.formStack}>
              {!isEditing && onTypeChange && (
                <div style={{ marginBottom: "1rem" }}>
                  <label className={styles.label}>Select Material Type *</label>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button type="button" className={type === "brochure" ? styles.btnPrimary : styles.btnSecondary} onClick={() => onTypeChange("brochure")} style={{ flex: 1, padding: "8px", justifyContent: "center" }}>Brochure</button>
                    <button type="button" className={type === "video" ? styles.btnPrimary : styles.btnSecondary} onClick={() => onTypeChange("video")} style={{ flex: 1, padding: "8px", justifyContent: "center" }}>Video</button>
                    <button type="button" className={type === "ad" ? styles.btnPrimary : styles.btnSecondary} onClick={() => onTypeChange("ad")} style={{ flex: 1, padding: "8px", justifyContent: "center" }}>Ad Banner</button>
                  </div>
                </div>
              )}
              <label className={styles.label}>Title</label>
              <input required className={styles.input} value={form.title || ""} onChange={e => onFormChange({ title: e.target.value })} />
              
              {type === "brochure" && (
                <>
                  <label className={styles.label}>Category *</label>
                  <select required className={styles.input} value={form.category || ""} onChange={e => onFormChange({ category: e.target.value })}>
                    <option value="" disabled>Select a category...</option>
                    <option value="Product Brochure">Product Brochure</option>
                    <option value="Technical Specs">Technical Specs</option>
                    <option value="Case Study">Case Study</option>
                    <option value="Whitepaper">Whitepaper</option>
                  </select>
                </>
              )}
              {type === "video" && (
                <>
                  <label className={styles.label}>Duration</label>
                  <input required className={styles.input} value={form.duration || ""} onChange={e => onFormChange({ duration: e.target.value })} />
                  <label className={styles.label}>Resolution</label>
                  <input required className={styles.input} value={form.resolution || ""} onChange={e => onFormChange({ resolution: e.target.value })} />
                </>
              )}
              {type === "ad" && (
                <>
                  <label className={styles.label}>Format</label>
                  <input required className={styles.input} value={form.format || ""} onChange={e => onFormChange({ format: e.target.value })} />
                </>
              )}

              <label className={styles.label}>Description</label>
              <textarea className={styles.input} rows={3} value={form.description || ""} onChange={e => onFormChange({ description: e.target.value })} />

              <label className={styles.label} style={{ marginTop: '0.25rem' }}>Upload Document *</label>
              <div style={{ border: '1px dashed var(--color-border-strong)', padding: '1.5rem', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--color-text-2)' }}>
                <input type="file" required style={{ display: 'block', margin: '0 auto' }} />
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--color-text-3)' }}>Supports documents up to 25MB</div>
              </div>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>Save {typeName}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
