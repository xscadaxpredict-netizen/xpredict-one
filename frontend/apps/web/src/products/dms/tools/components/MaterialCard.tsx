import { useState } from "react";
import { Edit2Icon, Trash2Icon, DownloadIcon, FileTextIcon, PlayCircleIcon } from "lucide-react";
import { PreviewModal } from "../../../../shared/components/PreviewModal";
import styles from "./MaterialCard.module.css";

interface Props {
  item: any;
  type: "brochure" | "video" | "ad";
  onEdit?: (item: any) => void;
  onDelete?: (id: string) => void;
}

export function MaterialCard({ item, type, onEdit, onDelete }: Props) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const getFileType = (url: string) => {
    if (!url) return "unknown";
    const lower = url.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.m4v')) return "video";
    if (lower.endsWith('.pdf')) return "pdf";
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif')) return "image";
    return "unknown";
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = item.file;
    a.download = item.fileName || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
    <div className={styles.card}>
      {(onEdit || onDelete) && (
        <div className={styles.actions}>
          {onEdit && <button className={styles.iconBtn} onClick={() => onEdit(item)}><Edit2Icon size={14} /></button>}
          {onDelete && <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(item.id)}><Trash2Icon size={14} /></button>}
        </div>
      )}
      <div 
        onClick={() => setIsPreviewOpen(true)} 
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
        {getFileType(item.file) === "video" ? (
          <>
            <video src={`${item.file}#t=0.1`} preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", top: 0, left: 0 }} />
            <div style={{ zIndex: 1, background: "rgba(0,0,0,0.5)", color: "white", borderRadius: "50%", display: "flex", padding: "4px" }}>
              <PlayCircleIcon size={32} />
            </div>
          </>
        ) : getFileType(item.file) === "image" ? (
          <img src={item.file} alt="thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : getFileType(item.file) === "pdf" ? (
          <FileTextIcon size={48} />
        ) : (
          <FileTextIcon size={32} />
        )}
      </div>
      <div className={styles.title} onClick={() => setIsPreviewOpen(true)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>
        {item.title}
      </div>
      <div className={styles.meta}>
        {type === "brochure" && `${item.category} • ${item.fileSize || item.file_size}`}
        {type === "video" && `${item.duration} • ${item.resolution}`}
        {type === "ad" && `${item.format} • ${item.fileSize || item.file_size}`}
      </div>
      <div className={styles.desc}>{item.description}</div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem' }}>
        <button type="button" className={styles.btnSecondary} onClick={handleDownload} style={{ flex: 1 }}>
          <DownloadIcon size={15} /> Download
        </button>
      </div>
    </div>
    <PreviewModal
      isOpen={isPreviewOpen}
      url={item.file}
      type={getFileType(item.file)}
      title={item.title || item.fileName}
      onClose={() => setIsPreviewOpen(false)}
    />
    </>
  );
}
