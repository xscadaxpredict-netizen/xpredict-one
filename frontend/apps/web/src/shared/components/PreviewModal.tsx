import { XIcon } from "lucide-react";
import { useEffect } from "react";
import styles from "./PreviewModal.module.css";

interface Props {
  isOpen: boolean;
  url: string | null;
  type: "image" | "video" | "pdf" | "unknown";
  title?: string;
  onClose: () => void;
}

export function PreviewModal({ isOpen, url, type, title, onClose }: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [isOpen]);

  if (!isOpen || !url) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title || "Preview"}</h3>
          <button className={styles.closeBtn} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <div className={styles.body}>
          {type === "image" && <img src={url} alt={title} className={styles.previewImage} />}
          {type === "video" && <video src={url} controls autoPlay className={styles.previewVideo} />}
          {type === "pdf" && <iframe src={url} className={styles.previewIframe} title={title} />}
          {type === "unknown" && (
            <div className={styles.unknownState}>
              <p>Preview not available for this file type.</p>
              <a href={url} target="_blank" rel="noreferrer" className={styles.downloadLink}>Download File</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
