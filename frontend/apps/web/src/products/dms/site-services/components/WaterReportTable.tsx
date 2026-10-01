import { DropletIcon, EyeIcon, Edit3Icon, Trash2Icon } from "lucide-react";
import styles from "./WaterReportTable.module.css";

interface Props {
  reports: any[];
  onView: (report: any) => void;
  onEdit: (report: any) => void;
  onDelete: (id: string) => void;
}

export function WaterReportTable({ reports, onView, onEdit, onDelete }: Props) {
  if (reports.length === 0) {
    return (
      <div className={styles.emptyState}>
        <DropletIcon size={36} className={styles.emptyIcon} />
        <div>No Water Quality Reports Found</div>
        <div className={styles.muted}>Click "New Water Report" to log water testing data.</div>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Date</th>
            <th className={styles.th}>Site / Customer</th>
            <th className={styles.th}>Machine (OC)</th>
            <th className={styles.th}>Attachment</th>
            <th className={styles.thRight}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className={styles.row}>
              <td className={styles.td}>
                <div className={styles.bold}>{report.date}</div>
              </td>
              <td className={styles.td}>
                <div className={styles.bold}>{report.siteName}</div>
              </td>
              <td className={styles.td}>
                <div className={styles.muted}>{report.ocNumber || "No OC"}</div>
              </td>
              <td className={styles.td}>
                <div className={styles.bold}>{report.attachment || "No File"}</div>
              </td>
              <td className={styles.tdRight}>
                <div className={styles.actions}>
                  <button type="button" className={styles.iconBtn} title="View Report" onClick={() => onView(report)}>
                    <EyeIcon size={16} />
                  </button>
                  <button type="button" className={styles.iconBtnPrimary} title="Edit Report" onClick={() => onEdit(report)}>
                    <Edit3Icon size={16} />
                  </button>
                  <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete Report" onClick={() => onDelete(report.id)}>
                    <Trash2Icon size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
