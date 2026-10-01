import { FileTextIcon, Edit2Icon, Trash2Icon, DownloadIcon } from "lucide-react";
import type { UserManual } from "../api/types";
import styles from "./ManualList.module.css";

interface Props {
  manuals: UserManual[];
  onEdit: (manual: UserManual) => void;
  onDelete: (id: string) => void;
}

export function ManualList({ manuals, onEdit, onDelete }: Props) {
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
          <div className={styles.actions}>
            <button className={styles.iconBtn} onClick={() => onEdit(manual)}><Edit2Icon size={14} /></button>
            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(manual.id)}><Trash2Icon size={14} /></button>
          </div>
          <div className={styles.title}>{manual.title}</div>
          <div className={styles.meta}>{manual.category} • {manual.fileSize}</div>
          <div className={styles.desc}>{manual.description}</div>
          <button type="button" className={styles.btnSecondary} onClick={() => alert(`Downloading ${manual.fileName}`)}>
            <DownloadIcon size={15} /> Download PDF
          </button>
        </div>
      ))}
    </div>
  );
}
