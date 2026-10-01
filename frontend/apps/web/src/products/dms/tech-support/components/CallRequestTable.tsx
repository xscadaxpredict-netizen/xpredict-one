import { PhoneCallIcon, Trash2Icon, EyeIcon, CheckCircleIcon } from "lucide-react";
import type { RequestCall } from "../api/types";
import styles from "./CallRequestTable.module.css";

interface Props {
  calls: RequestCall[];
  onView: (call: RequestCall) => void;
  onUpdateStatus: (id: string, status: "PENDING" | "COMPLETED" | "CANCELLED") => void;
  onDelete: (id: string) => void;
}

export function CallRequestTable({ calls, onView, onUpdateStatus, onDelete }: Props) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING": return <span className={`${styles.badge} ${styles.badgePending}`}>PENDING</span>;
      case "COMPLETED": return <span className={`${styles.badge} ${styles.badgeCompleted}`}>COMPLETED</span>;
      case "CANCELLED": return <span className={`${styles.badge} ${styles.badgeCancelled}`}>CANCELLED</span>;
      default: return null;
    }
  };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Date</th>
            <th className={styles.th}>Customer Name</th>
            <th className={styles.th}>Contact Info</th>
            <th className={styles.th}>Subject / Issue</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Action</th>
            <th className={styles.th} style={{ width: "40px" }}></th>
          </tr>
        </thead>
        <tbody>
          {calls.length === 0 ? (
            <tr><td colSpan={7} className={styles.emptyState}><PhoneCallIcon size={32} style={{ margin: "0 auto 0.5rem auto", opacity: 0.4, display: "block" }} />No callback requests found.</td></tr>
          ) : (
            calls.map((call) => (
              <tr key={call.id} className={styles.row}>
                <td className={styles.td}>{call.date}</td>
                <td className={styles.td}><span className={styles.bold}>{call.name}</span></td>
                <td className={styles.td}>
                  <div style={{ fontWeight: 600 }}>{call.phone}</div>
                  <div className={styles.muted}>{call.email}</div>
                </td>
                <td className={styles.td}>
                  <span className={styles.accent}>{call.subject}</span>
                </td>
                <td className={styles.td}>{getStatusBadge(call.status)}</td>
                <td className={styles.td}>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <button type="button" className={`${styles.btnSmall} ${styles.btnView}`} onClick={() => onView(call)}>
                      <EyeIcon size={12} /> View Details
                    </button>
                    {call.status === "PENDING" && (
                      <button type="button" className={`${styles.btnSmall} ${styles.btnComplete}`} onClick={() => onUpdateStatus(call.id, "COMPLETED")}>
                        <CheckCircleIcon size={12} /> Mark Done
                      </button>
                    )}
                  </div>
                </td>
                <td className={styles.td}>
                  <button className={styles.btnIconDanger} onClick={() => onDelete(call.id)}><Trash2Icon size={16} /></button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
