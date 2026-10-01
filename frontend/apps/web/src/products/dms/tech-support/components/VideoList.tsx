import { VideoIcon, Edit2Icon, Trash2Icon, PlayCircleIcon } from "lucide-react";
import type { MachineVideo } from "../api/types";
import styles from "./VideoList.module.css";

interface Props {
  videos: MachineVideo[];
  onEdit: (video: MachineVideo) => void;
  onDelete: (id: string) => void;
}

export function VideoList({ videos, onEdit, onDelete }: Props) {
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
          <div className={styles.actions}>
            <button className={styles.iconBtn} onClick={() => onEdit(video)}><Edit2Icon size={14} /></button>
            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(video.id)}><Trash2Icon size={14} /></button>
          </div>
          <div className={styles.videoThumb}>
            <PlayCircleIcon size={32} />
          </div>
          <div className={styles.title}>{video.title}</div>
          <div className={styles.meta}>{video.category} • {video.duration}</div>
          <div className={styles.desc}>{video.description}</div>
        </div>
      ))}
    </div>
  );
}
