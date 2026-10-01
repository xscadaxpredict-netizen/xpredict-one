import { Edit2Icon, Trash2Icon, DownloadIcon } from "lucide-react";
import styles from "./MaterialCard.module.css";

interface Props {
  item: any;
  type: "brochure" | "video" | "ad";
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
}

export function MaterialCard({ item, type, onEdit, onDelete }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.actions}>
        <button className={styles.iconBtn} onClick={() => onEdit(item)}><Edit2Icon size={14} /></button>
        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(item.id)}><Trash2Icon size={14} /></button>
      </div>
      <div className={styles.title}>{item.title}</div>
      <div className={styles.meta}>
        {type === "brochure" && `${item.category} • ${item.fileSize}`}
        {type === "video" && `${item.duration} • ${item.resolution}`}
        {type === "ad" && `${item.format} • ${item.fileSize}`}
      </div>
      <div className={styles.desc}>{item.description}</div>
      <button type="button" className={styles.btnSecondary} onClick={() => alert(`Downloading ${item.fileName}`)}>
        <DownloadIcon size={15} /> Download / View
      </button>
    </div>
  );
}
