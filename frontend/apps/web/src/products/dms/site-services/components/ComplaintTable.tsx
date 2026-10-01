import { AlertTriangleIcon, EyeIcon, Edit3Icon, Trash2Icon } from "lucide-react";
import styles from "./ComplaintTable.module.css";

interface Props {
  reports: any[];
  onView: (report: any) => void;
  onEdit: (report: any) => void;
  onDelete: (report: any) => void;
}

export function ComplaintTable({ reports, onView, onEdit, onDelete }: Props) {
  if (reports.length === 0) {
    return (
      <div className={styles.emptyState}>
        <AlertTriangleIcon size={36} className={styles.emptyIcon} />
        <div>No Complaints Logged</div>
        <div className={styles.muted}>Sites are running smoothly.</div>
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
            <th className={styles.th}>Issue</th>
            <th className={styles.th}>Priority</th>
            <th className={styles.th}>Status</th>
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
                <div className={styles.bold}>{report.issue}</div>
              </td>
              <td className={styles.td}>
                <span className={`${styles.badge} ${styles["priority" + report.priority]}`}>
                  {report.priority}
                </span>
              </td>
              <td className={styles.td}>
                <span className={`${styles.badge} ${styles["status" + report.status]}`}>
                  {report.status}
                </span>
              </td>
              <td className={styles.tdRight}>
                <div className={styles.actions}>
                  <button type="button" className={styles.iconBtn} title="View Complaint" onClick={() => onView(report)}>
                    <EyeIcon size={16} />
                  </button>
                  <button type="button" className={styles.iconBtnPrimary} title="Edit Complaint" onClick={() => onEdit(report)}>
                    <Edit3Icon size={16} />
                  </button>
                  <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete Complaint" onClick={() => onDelete(report)}>
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
