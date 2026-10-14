import { Fragment, useState } from "react";
import { AlertTriangleIcon, EyeIcon, Edit3Icon, Trash2Icon, CheckCircle2Icon, RotateCcwIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { FileAttachmentCell } from "./FileAttachmentCell";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./ComplaintTable.module.css";

interface Props {
  reports: any[];
  onView: (report: any) => void;
  onEdit: (report: any) => void;
  onToggleStatus?: (report: any) => void;
  onDelete: (report: any) => void;
}

export function ComplaintTable({ reports, onView, onEdit, onToggleStatus, onDelete }: Props) {
  const { canEditComplaint, canDeleteComplaint, canResolveComplaint } = useDmsPermissions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
            <th className={styles.th}>Service Person</th>
            <th className={styles.th}>Priority</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Attachment</th>
            <th className={styles.thRight}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const isResolved = report.status === "RESOLVED";
            const isExpanded = expandedId === report.id;

            return (
              <Fragment key={report.id}>
                <tr className={styles.row} onClick={() => toggleExpand(report.id)} style={{ cursor: "pointer" }}>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.date || report.created_at?.split("T")[0] || "—"}</div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.siteName}</div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.muted}>{report.ocNumber || "No OC"}</div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.issue || report.description || "—"}</div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.assigned_service_person_name || report.servicePersonName || report.personName || "—"}</div>
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
                  <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                    {report.attachments && Array.isArray(report.attachments) && report.attachments.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {report.attachments.map((att: any, i: number) => (
                          <FileAttachmentCell key={i} attachment={typeof att === "string" ? att : (att.file || att)} />
                        ))}
                      </div>
                    ) : (
                      <FileAttachmentCell attachment={report.attachment} />
                    )}
                  </td>
                  <td className={styles.tdRight} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.actions}>
                      {onToggleStatus && canResolveComplaint && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          style={{ color: isResolved ? "#f59e0b" : "#10b981" }}
                          title={isResolved ? "Unresolve / Reopen Ticket" : "Mark as Resolved"}
                          onClick={() => onToggleStatus(report)}
                        >
                          {isResolved ? <RotateCcwIcon size={16} /> : <CheckCircle2Icon size={16} />}
                        </button>
                      )}
                      <button type="button" className={styles.iconBtn} title="View Complaint" onClick={() => onView(report)}>
                        <EyeIcon size={16} />
                      </button>
                      {canEditComplaint && (
                        <button type="button" className={styles.iconBtnPrimary} title="Edit Complaint" onClick={() => onEdit(report)}>
                          <Edit3Icon size={16} />
                        </button>
                      )}
                      {canDeleteComplaint && (
                        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete Complaint" onClick={() => onDelete(report)}>
                          <Trash2Icon size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.expandBtn}
                        title="Toggle actions"
                        onClick={() => toggleExpand(report.id)}
                      >
                        {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={9} className={styles.expandedCell}>
                      <div className={styles.expandedContent}>
                        <div className={styles.mobileActionsBar}>
                          {onToggleStatus && canResolveComplaint && (
                            <button
                              type="button"
                              className={styles.iconBtn}
                              style={{ color: isResolved ? "#f59e0b" : "#10b981" }}
                              onClick={() => onToggleStatus(report)}
                            >
                              {isResolved ? <RotateCcwIcon size={16} /> : <CheckCircle2Icon size={16} />}
                              <span>{isResolved ? "Reopen" : "Resolve"}</span>
                            </button>
                          )}
                          <button type="button" className={styles.iconBtn} onClick={() => onView(report)}>
                            <EyeIcon size={16} /> <span>View</span>
                          </button>
                          {canEditComplaint && (
                            <button type="button" className={styles.iconBtnPrimary} onClick={() => onEdit(report)}>
                              <Edit3Icon size={16} /> <span>Edit</span>
                            </button>
                          )}
                          {canDeleteComplaint && (
                            <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(report)}>
                              <Trash2Icon size={16} /> <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}



