import { Fragment, useState } from "react";
import { DropletIcon, EyeIcon, Edit3Icon, Trash2Icon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { FileAttachmentCell } from "./FileAttachmentCell";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./WaterReportTable.module.css";

interface Props {
  reports: any[];
  onView: (report: any) => void;
  onEdit: (report: any) => void;
  onDelete: (id: string) => void;
}

export function WaterReportTable({ reports, onView, onEdit, onDelete }: Props) {
  const { canEditWaterReport, canDeleteWaterReport } = useDmsPermissions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
          {reports.map((report) => {
            const isExpanded = expandedId === report.id;
            return (
              <Fragment key={report.id}>
                <tr className={styles.row} onClick={() => toggleExpand(report.id)} style={{ cursor: "pointer" }}>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.date || report.date_tested || "—"}</div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.siteName}</div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.muted}>{report.ocNumber || "No OC"}</div>
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
                      <button type="button" className={styles.iconBtn} title="View Report" onClick={() => onView(report)}>
                        <EyeIcon size={16} />
                      </button>
                      {canEditWaterReport && (
                        <button type="button" className={styles.iconBtnPrimary} title="Edit Report" onClick={() => onEdit(report)}>
                          <Edit3Icon size={16} />
                        </button>
                      )}
                      {canDeleteWaterReport && (
                        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete Report" onClick={() => onDelete(report.id)}>
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
                    <td colSpan={5} className={styles.expandedCell}>
                      <div className={styles.expandedContent}>
                        <div className={styles.mobileActionsBar}>
                          <button type="button" className={styles.iconBtn} onClick={() => onView(report)}>
                            <EyeIcon size={16} /> <span>View</span>
                          </button>
                          {canEditWaterReport && (
                            <button type="button" className={styles.iconBtnPrimary} onClick={() => onEdit(report)}>
                              <Edit3Icon size={16} /> <span>Edit</span>
                            </button>
                          )}
                          {canDeleteWaterReport && (
                            <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(report.id)}>
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



