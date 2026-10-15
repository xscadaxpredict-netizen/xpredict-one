import { useState } from "react";
import { VideoIcon, Edit2Icon, Trash2Icon, PlayCircleIcon, DownloadIcon } from "lucide-react";
import type { MachineVideo } from "../api/types";
import { PreviewModal } from "../../../../shared/components/PreviewModal";
import styles from "./VideoList.module.css";

interface Props {
  videos: MachineVideo[];
  onEdit?: (video: MachineVideo) => void;
  onDelete?: (id: string) => void;
}

export function VideoList({ videos, onEdit, onDelete }: Props) {
  const [previewVideo, setPreviewVideo] = useState<MachineVideo | null>(null);

  const handleDownload = (video: MachineVideo) => {
    const a = document.createElement("a");
    a.href = video.file || "";
    a.download = video.file_name || "video.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (videos.length === 0) {
    return (
      <div className={styles.emptyState}>
        <VideoIcon size={32} style={{ margin: "0 auto 10px auto", opacity: 0.4 }} />
        <p>No training or maintenance videos uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {videos.map((video) => (
        <div key={video.id} className={styles.card}>
          {(onEdit || onDelete) && (
            <div className={styles.actions}>
              {onEdit && <button className={styles.iconBtn} onClick={() => onEdit(video)}><Edit2Icon size={14} /></button>}
              {onDelete && <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(video.id)}><Trash2Icon size={14} /></button>}
            </div>
          )}
          <div 
            className={styles.videoThumb} 
            onClick={() => setPreviewVideo(video)} 
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
            <video src={`${video.file}#t=0.1`} preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", top: 0, left: 0 }} />
            <div style={{ zIndex: 1, background: "rgba(0,0,0,0.5)", color: "white", borderRadius: "50%", display: "flex", padding: "4px" }}>
              <PlayCircleIcon size={32} />
            </div>
          </div>
          <div className={styles.title} onClick={() => setPreviewVideo(video)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>
            {video.title}
          </div>
          <div className={styles.meta}>{video.category} • {video.duration}</div>
          <div className={styles.desc}>{video.description}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem' }}>
            <button type="button" className={styles.btnSecondary} onClick={() => handleDownload(video)} style={{ flex: 1 }}>
              <DownloadIcon size={15} /> Download
            </button>
          </div>
        </div>
      ))}
      <PreviewModal
        isOpen={!!previewVideo}
        url={previewVideo?.file || null}
        type="video"
        title={previewVideo?.title ?? previewVideo?.file_name}
        onClose={() => setPreviewVideo(null)}
      />
    </div>
  );
}
