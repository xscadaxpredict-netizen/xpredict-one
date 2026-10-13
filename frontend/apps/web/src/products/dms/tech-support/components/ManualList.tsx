import { useState } from "react";
import { FileTextIcon, Edit2Icon, Trash2Icon, DownloadIcon, EyeIcon } from "lucide-react";
import type { UserManual } from "../api/types";
import { PreviewModal } from "../../../../shared/components/PreviewModal";
import styles from "./ManualList.module.css";

interface Props {
  manuals: UserManual[];
  onEdit?: (manual: UserManual) => void;
  onDelete?: (id: string) => void;
}

export function ManualList({ manuals, onEdit, onDelete }: Props) {
  const [previewManual, setPreviewManual] = useState<UserManual | null>(null);

  const handleDownload = (manual: UserManual) => {
    const a = document.createElement("a");
    a.href = manual.file || "";
    a.download = manual.fileName || "manual.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (manuals.length === 0) {
    return (
      <div className={styles.emptyState}>
        <FileTextIcon size={32} style={{ margin: "0 auto 10px auto", opacity: 0.4 }} />
        <p>No user manuals uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {manuals.map((manual) => (
        <div key={manual.id} className={styles.card}>
          {(onEdit || onDelete) && (
            <div className={styles.actions}>
              {onEdit && <button className={styles.iconBtn} onClick={() => onEdit(manual)}><Edit2Icon size={14} /></button>}
              {onDelete && <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(manual.id)}><Trash2Icon size={14} /></button>}
            </div>
          )}
          <div 
            onClick={() => setPreviewManual(manual)} 
            style={{ 
              cursor: "pointer", 
              display: "flex", 
              justifyContent: "center", 
              alignItems: "center", 
              background: "var(--color-surface-hover)", 
              borderRadius: "var(--radius-md)", 
              marginBottom: "1rem",
              color: "var(--color-primary)",
              position: "relative",
              height: "150px",
              overflow: "hidden"
            }}
          >
            {manual.file?.toLowerCase().endsWith('.pdf') ? (
              <FileTextIcon size={48} />
            ) : (
              <FileTextIcon size={32} />
            )}
          </div>
          <div className={styles.title} onClick={() => setPreviewManual(manual)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>
            {manual.title}
          </div>
          <div className={styles.meta}>{manual.category} • {manual.fileSize || (manual as any).file_size}</div>
          <div className={styles.desc}>{manual.description}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem' }}>
            <button type="button" className={styles.btnSecondary} onClick={() => handleDownload(manual)} style={{ flex: 1 }}>
              <DownloadIcon size={15} /> Download
            </button>
          </div>
        </div>
      ))}
      <PreviewModal
        isOpen={!!previewManual}
        url={previewManual?.file || null}
        type="pdf"
        title={previewManual?.title || previewManual?.fileName}
        onClose={() => setPreviewManual(null)}
      />
    </div>
  );
}
