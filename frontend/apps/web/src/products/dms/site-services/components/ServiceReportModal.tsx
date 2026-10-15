import { useState, useRef } from "react";
import { Camera, X } from "lucide-react";
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photoPreviews, setPhotoPreviews] = useState<{url: string, file?: File}[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>(form?.existingAttachments || []);

  if (!isOpen) return null;

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newPreviews: {url: string, file?: File}[] = [];

    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          newPreviews.push({url: reader.result, file});
          if (newPreviews.length === fileArray.length) {
            const updated = [...photoPreviews, ...newPreviews];
            setPhotoPreviews(updated);
            onFormChange({ attachments: [...(form?.attachments || []), ...fileArray] });
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    const updated = photoPreviews.filter((_, i) => i !== index);
    setPhotoPreviews(updated);
    
    // Also remove from form.attachments
    // Typed at the call site because the `form` prop is `any`; without these
    // annotations both parameters are implicitly `any` and tsc refuses.
    const updatedAttachments = (form?.attachments || []).filter(
      (_: unknown, i: number) => i !== index,
    );
    onFormChange({ attachments: updatedAttachments });
  };

  const removeExistingAttachment = (index: number) => {
    const updated = existingAttachments.filter((_: any, i: number) => i !== index);
    setExistingAttachments(updated);
    onFormChange({ existingAttachments: updated });
  };

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

            {/* 1.5 Zone Selection */}
            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>
                  Service Zone <span className={styles.required}>*</span>
                </label>
                <select 
                  required 
                  className={styles.input}
                  value={form.zone || "North Zone"}
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
                  <label className={styles.label}>
                    Custom Zone <span className={styles.required}>*</span>
                  </label>
                  <input 
                    required
                    type="text"
                    placeholder="Enter custom zone"
                    className={styles.input}
                    value={form.customZone || ""}
                    onChange={e => onFormChange({ customZone: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* 2. Tech & Date */}
            <div className={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>
                  Technician <span className={styles.required}>*</span>
                </label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. Ramesh"
                  className={styles.input}
                  value={form.technician || ""}
                  onChange={e => onFormChange({ technician: e.target.value, servicePersonName: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>
                  Service Date <span className={styles.required}>*</span>
                </label>
                <input 
                  required
                  type="date"
                  className={styles.input}
                  value={form.date || ""}
                  onChange={e => onFormChange({ date: e.target.value })}
                />
              </div>
            </div>

            {/* 3. Remarks */}
            <div>
              <label className={styles.label}>
                Service Remarks / Details <span className={styles.required}>*</span>
              </label>
              <textarea 
                required
                rows={3}
                placeholder="Describe the maintenance performed..."
                className={styles.input}
                value={form.remarks || ""}
                onChange={e => onFormChange({ remarks: e.target.value })}
              />
            </div>

            {/* 3.5 Attachments & Camera Photo Capture */}
            <div>
              <label className={styles.label}>Attachments & Site Photos</label>
              
              {/* Hidden camera input for direct device capture */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleCameraCapture}
              />

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input 
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  className={styles.input}
                  onChange={handleCameraCapture}
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

              {/* Existing Attachments Previews */}
              {existingAttachments.length > 0 && (
                <div style={{ marginTop: "12px", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-2)" }}>
                  Previously Attached ({existingAttachments.length}):
                </div>
              )}
              {existingAttachments.length > 0 && (
                <div className={styles.photoPreviewGrid}>
                  {existingAttachments.map((att, idx) => {
                    const isImg = att.file.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                    return (
                      <div key={idx} className={styles.photoThumbnail} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
                        {isImg ? (
                          <img src={att.file} alt={att.file_name} />
                        ) : (
                          <div style={{ padding: "10px", background: "#f0f0f0", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis" }}>{att.file_name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          className={styles.btnRemovePhoto}
                          onClick={() => removeExistingAttachment(idx)}
                          title="Remove Attachment"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New Photo Previews */}
              {photoPreviews.length > 0 && (
                <div className={styles.photoPreviewGrid} style={{ marginTop: existingAttachments.length > 0 ? "8px" : "0" }}>
                  {photoPreviews.map((preview, idx) => (
                    <div key={`new-${idx}`} className={styles.photoThumbnail}>
                      <img src={preview.url} alt={`Captured site photo ${idx + 1}`} />
                      <button
                        type="button"
                        className={styles.btnRemovePhoto}
                        onClick={() => removePhoto(idx)}
                        title="Remove Photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Signatures Box */}
            <div className={styles.signatureBox}>
              <h4 className={styles.signatureBoxTitle}>Signatures</h4>
              <div className={styles.signatureStack}>
                <div className={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>
                      Service Person Name <span className={styles.required}>*</span>
                    </label>
                    <input 
                      required
                      type="text"
                      className={styles.input}
                      value={form.servicePersonName || ""}
                      onChange={e => onFormChange({ servicePersonName: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SignaturePad 
                      label="Service Person Signature" 
                      isRequired={true} 
                      value={form.servicePersonSignature || ""} 
                      onChange={(val: string) => onFormChange({ servicePersonSignature: val })}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <label className={styles.label}>
                      Client Name <span className={styles.required}>*</span>
                    </label>
                    <input 
                      required
                      type="text"
                      className={styles.input}
                      value={form.clientName || ""}
                      onChange={e => onFormChange({ clientName: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SignaturePad 
                      label="Client Signature" 
                      isRequired={false} 
                      value={form.clientSignature || ""} 
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
