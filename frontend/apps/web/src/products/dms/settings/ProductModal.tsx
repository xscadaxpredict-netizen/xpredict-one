import { useState, useEffect, useRef } from "react";
import type { ProductPreset, NewProductPreset, QuoteType } from "../sales/api/types";
import { useCreateProductPreset, useUpdateProductPreset } from "../sales/hooks/useEnquiries";
import styles from "./SettingsDialog.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  product?: ProductPreset;
}

export function ProductModal({ open, onClose, product }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const createProduct = useCreateProductPreset();
  const updateProduct = useUpdateProductPreset();

  const [formData, setFormData] = useState<Omit<NewProductPreset, "base_price" | "margin" | "gst_rate" | "specs"> & { base_price: number | string, margin: number | string, gst_rate: number | string, specs: string }>({
    type: "NORMAL",
    name: "",
    description: "",
    hsn: "",
    base_price: "",
    margin: "",
    gst_rate: 18,
    category: "",
    specs: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (product) {
      setFormData({
        ...product,
        specs: product.specs ? product.specs.join(", ") : "",
      });
    } else {
      setFormData({
        type: "NORMAL",
        name: "",
        description: "",
        hsn: "",
        base_price: "",
        margin: "",
        gst_rate: 18,
        category: "",
        specs: "",
      });
    }
    setImageFile(null);
  }, [product, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = new FormData();
    payload.append("type", formData.type);
    payload.append("name", formData.name || "");
    payload.append("description", formData.description || "");
    payload.append("hsn", formData.hsn || "");
    payload.append("base_price", String(typeof formData.base_price === "string" ? parseFloat(formData.base_price) || 0 : formData.base_price));
    payload.append("margin", String(formData.margin === "" || formData.margin === null ? 0 : (typeof formData.margin === "string" ? parseFloat(formData.margin) || 0 : formData.margin)));
    payload.append("gst_rate", String(typeof formData.gst_rate === "string" ? parseFloat(formData.gst_rate) || 0 : formData.gst_rate));
    payload.append("category", formData.category || "");
    payload.append("specs", formData.specs || "");
    
    if (imageFile) {
      payload.append("image", imageFile);
    }

    if (product) {
      updateProduct.mutate({ productId: product.id, body: payload }, {
        onSuccess: () => {
          onClose();
        }
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => {
          onClose();
        }
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <dialog 
      ref={dialogRef} 
      className={styles.dialog}
      onKeyDown={handleKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{product ? "Edit Product" : "Add Product"}</h2>
      </header>
        
      <form onSubmit={handleSubmit}>
        <div className={styles.content}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Product Type</label>
              <select
                className={styles.select}
                value={formData.type}
                onChange={(e) => setFormData(p => ({ ...p, type: e.target.value as QuoteType }))}
              >
                <option value="NORMAL">NORMAL</option>
                <option value="AMC">AMC</option>
                <option value="SPARES">SPARES</option>
              </select>
            </div>
            {formData.type === "SPARES" && (
              <div className={styles.field}>
                <label className={styles.label}>
                                  Category <span style={{ color: "red" }}>*</span>
                              </label>
                <input 
                  className={styles.input}
                  value={formData.category || ""} 
                  onChange={(e) => setFormData(p => ({ ...p, category: e.target.value }))}
                  required
                />
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
                          Name <span style={{ color: "red" }}>*</span>
                      </label>
            <input 
              className={styles.input}
              value={formData.name || ""} 
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
                          Description <span style={{ color: "red" }}>*</span>
                      </label>
            <input 
              className={styles.input}
              value={formData.description} 
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>HSN Code</label>
              <input 
                className={styles.input}
                value={formData.hsn} 
                onChange={(e) => setFormData(p => ({ ...p, hsn: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                              Base Price (₹) <span style={{ color: "red" }}>*</span>
                          </label>
              <input 
                className={styles.input}
                type="number"
                step="0.01"
                value={formData.base_price} 
                onChange={(e) => setFormData(p => ({ ...p, base_price: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Margin (%)</label>
              <input 
                className={styles.input}
                type="number"
                step="0.01"
                value={formData.margin ?? ""} 
                onChange={(e) => setFormData(p => ({ ...p, margin: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                              GST Rate (%) <span style={{ color: "red" }}>*</span>
                          </label>
              <input 
                className={styles.input}
                type="number"
                step="0.01"
                value={formData.gst_rate} 
                onChange={(e) => setFormData(p => ({ ...p, gst_rate: e.target.value }))}
                required
              />
            </div>
          </div>
          
          {formData.type === "SPARES" && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Specs (comma separated)</label>
                <input 
                  className={styles.input}
                  value={formData.specs} 
                  onChange={(e) => setFormData(p => ({ ...p, specs: e.target.value }))}
                  placeholder="e.g. Size: 1.5 Inch, Material: Brass"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Product Image</label>
                {product?.image && !imageFile && (
                  <div style={{ marginBottom: "8px", fontSize: "0.85rem" }}>
                    Current Image: <a href={product.image} target="_blank" rel="noreferrer">View</a>
                  </div>
                )}
                <input 
                  className={styles.input}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </div>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.btnSecondary} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={styles.btnPrimary} type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
            {createProduct.isPending || updateProduct.isPending ? "Saving..." : "Save"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
