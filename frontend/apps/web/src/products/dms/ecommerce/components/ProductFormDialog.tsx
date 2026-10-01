import { XIcon } from "lucide-react";

import styles from "./ProductFormDialog.module.css";

interface Props {
  isOpen: boolean;
  isEditing: boolean;
  categories: string[];
  form: { category: string; newCategory: string; name: string; price: string; specs: string };
  onFormChange: (updates: Partial<Props["form"]>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function ProductFormDialog({ isOpen, isEditing, categories, form, onFormChange, onSubmit, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Product" : "Add New Product"}</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formStack}>
              <label className={styles.label}>Category</label>
              <select className={styles.input} value={form.category} onChange={e => onFormChange({ category: e.target.value })}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="NEW">+ Create New Category</option>
              </select>
              {form.category === "NEW" && (
                <input required className={styles.input} placeholder="New Category Name" value={form.newCategory} onChange={e => onFormChange({ newCategory: e.target.value })} />
              )}

              <label className={styles.label} style={{ marginTop: "10px" }}>Product Name</label>
              <input required className={styles.input} value={form.name} onChange={e => onFormChange({ name: e.target.value })} />

              <label className={styles.label} style={{ marginTop: "10px" }}>Price (₹)</label>
              <input required type="number" className={styles.input} value={form.price} onChange={e => onFormChange({ price: e.target.value })} />

              <label className={styles.label} style={{ marginTop: "10px" }}>Specs (comma separated)</label>
              <input className={styles.input} placeholder="e.g. Size: 1.5 Inch, Material: Brass" value={form.specs} onChange={e => onFormChange({ specs: e.target.value })} />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary}>Save Product</button>
          </div>
        </form>
      </div>
    </div>
  );
}
