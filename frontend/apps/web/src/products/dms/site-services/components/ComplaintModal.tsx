import { useRef } from "react";
import { XIcon, Camera, X, FileText } from "lucide-react";
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

interface AttachedFileItem {
  file: File | string;
  name: string;
  previewUrl?: string;
  isImage: boolean;
}

export function ComplaintModal({ isOpen, isEditing, form, confirmedSites, onFormChange, onSubmit, onClose }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Retrieve current attachments list
  const currentAttachments: AttachedFileItem[] = form.attachedItems || (
    form.attachment 
      ? [{ file: form.attachment, name: form.attachmentName || (typeof form.attachment === "string" ? form.attachment.split("/").pop() || "file" : form.attachment.name), isImage: typeof form.attachment === "string" ? /\.(jpg|jpeg|png|gif|webp)$/i.test(form.attachment) : form.attachment.type.startsWith("image/") }]
      : []
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    const newItems: AttachedFileItem[] = newFiles.map((file) => {
      const isImg = file.type.startsWith("image/");
      return {
        file,
        name: file.name,
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
        isImage: isImg,
      };
    });

    const updated = [...currentAttachments, ...newItems];
    onFormChange({
      attachedItems: updated,
      attachments: updated.map((item) => item.file).filter((f) => f instanceof File),
      attachment: updated[0]?.file || null,
      attachmentName: updated[0]?.name || "",
    });

    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    const updated = currentAttachments.filter((_, i) => i !== index);
    onFormChange({
      attachedItems: updated,
      attachments: updated.map(item => item.file).filter(f => f instanceof File),
      attachment: updated[0]?.file || null,
      attachmentName: updated[0]?.name || "",
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEditing ? "Edit Complaint" : "Log a New Complaint"}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className={styles.formContainer}>
          <div className={styles.modalBody}>
            
            {/* Zone Filter & Site Selection */}
            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Zone (Pincode Filter)</label>
                <input 
                  type="text"
                  placeholder="Enter pincode..."
                  className={styles.input}
                  value={form.zonePincode || ""}
                  onChange={e => onFormChange({ zonePincode: e.target.value, siteId: "" })}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label className={styles.label}>
                  Select Site <span className={styles.required}>*</span>
                </label>
                <select 
                  required 
                  className={styles.input}
                  value={form.siteId || ""}
                  onChange={e => onFormChange({ siteId: e.target.value })}
                >
                  <option value="">-- Choose Deployed Customer Site --</option>
                  {confirmedSites
                    ?.filter(s => !form.zonePincode || s.pincode === form.zonePincode || (s.address && s.address.includes(form.zonePincode)))
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.customer_name} ({s.oc_number || 'No OC'})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Assigned Service Person (Optional)</label>
                <input 
                  type="text"
                  placeholder="Service Person / Assignee name..."
                  className={styles.input}
                  value={form.servicePersonName || ""}
                  onChange={e => onFormChange({ servicePersonName: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Priority</label>
                <select
                  className={styles.input}
                  value={form.priority || "MEDIUM"}
                  onChange={e => onFormChange({ priority: e.target.value })}
                >
                  <option value="LOW">Low Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="HIGH">High Priority</option>
                  <option value="CRITICAL">Critical / Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className={styles.label}>
                Describe the Issue / Complaint <span className={styles.required}>*</span>
              </label>
              <textarea 
                required
                rows={3}
                placeholder="E.g. low pressure, leaks, strange noise..."
                className={styles.input}
                style={{ resize: "vertical" }}
                value={form.issue || form.description || ""}
                onChange={e => onFormChange({ issue: e.target.value, description: e.target.value })}
              />
            </div>

            {/* Attachments & Camera Photo Capture */}
            <div>
              <label className={styles.label}>Attachment & Site Photos (Optional)</label>

              {/* Hidden camera input */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input 
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  className={styles.input}
                  onChange={handleFileUpload}
                  style={{ flex: 1 }}
                />

                <button
                  type="button"
                  className={styles.btnCamera}
                  onClick={() => cameraInputRef.current?.click()}
                  title="Capture photo directly using device camera"
                >
                  <Camera size={18} />
                  <span>Take Photo</span>
                </button>
              </div>

              {/* Display List of ALL Attached Files & Photos together */}
              {currentAttachments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-2)" }}>
                    Attached Files & Photos ({currentAttachments.length}):
                  </div>

                  <div className={styles.photoPreviewGrid}>
                    {currentAttachments.map((item, idx) => (
                      <div key={idx} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
                        {item.isImage && item.previewUrl ? (
                          <div className={styles.photoThumbnail}>
                            <img src={item.previewUrl} alt={item.name} />
                            <button
                              type="button"
                              className={styles.btnRemovePhoto}
                              onClick={() => removeAttachment(idx)}
                              title="Remove Photo"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "6px", fontSize: "0.85rem", color: "#1E40AF" }}>
                            <FileText size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                            <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                              {item.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(idx)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: "2px", display: "flex", alignItems: "center" }}
                              title="Remove File"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
