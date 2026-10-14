import { Fragment, useState } from "react";
import { PhoneCallIcon, Trash2Icon, EyeIcon, CheckCircleIcon, XCircleIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { FileAttachmentCell } from "../../site-services/components/FileAttachmentCell";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import type { RequestCall } from "../api/types";
import styles from "./CallRequestTable.module.css";

interface Props {
  calls: RequestCall[];
  onView: (call: RequestCall) => void;
  onUpdateStatus: (id: string, status: "PENDING" | "COMPLETED" | "CANCELLED") => void;
  onEdit?: (call: RequestCall) => void;
  onDelete: (id: string) => void;
}

export function CallRequestTable({ calls, onView, onUpdateStatus, onEdit, onDelete }: Props) {
  const { canEditCallRequest, canDeleteCallRequest, canResolveCallRequest } = useDmsPermissions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
            <th className={styles.th}>Attachment</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Action</th>
            <th className={styles.th} style={{ width: "40px" }}></th>
          </tr>
        </thead>
        <tbody>
          {calls.length === 0 ? (
            <tr><td colSpan={8} className={styles.emptyState}><PhoneCallIcon size={32} style={{ margin: "0 auto 0.5rem auto", opacity: 0.4, display: "block" }} />No callback requests found.</td></tr>
          ) : (
            calls.map((call) => {
              const isExpanded = expandedId === call.id;
              const attUrl = typeof call.attachment === "string" ? call.attachment : call.attachment instanceof File ? URL.createObjectURL(call.attachment) : null;
              return (
                <Fragment key={call.id}>
                  <tr className={styles.row} onClick={() => toggleExpand(call.id)} style={{ cursor: "pointer" }}>
                    <td className={styles.td}>
                      {call.date ? (call.date.includes("T") ? call.date.split("T")[0] : call.date) : "-"}
                    </td>
                    <td className={styles.td}><span className={styles.bold}>{call.name}</span></td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 600 }}>{call.phone}</div>
                      <div className={styles.muted}>{call.email}</div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.accent} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "250px" }}>
                        {call.message || call.subject}
                      </div>
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      {attUrl ? (
                        <FileAttachmentCell attachment={attUrl} label={call.attachment_name} />
                      ) : (
                        <span style={{ color: "var(--color-text-3, #6f7b89)", fontSize: "0.8rem" }}>-</span>
                      )}
                    </td>
                    <td className={styles.td}>{getStatusBadge(call.status)}</td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.desktopActions}>
                        <button type="button" className={`${styles.btnSmall} ${styles.btnView}`} onClick={() => onView(call)}>
                          <EyeIcon size={12} /> View
                        </button>
                        {call.status === "PENDING" && (
                          <button type="button" className={`${styles.btnSmall} ${styles.btnComplete}`} onClick={() => onUpdateStatus(call.id, "COMPLETED")}>
                            <CheckCircleIcon size={12} /> Mark Done
                          </button>
                        )}
                        {call.status === "COMPLETED" && (
                          <button type="button" className={`${styles.btnSmall} ${styles.btnUnmark}`} onClick={() => onUpdateStatus(call.id, "PENDING")}>
                            <XCircleIcon size={12} /> Unmark
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.desktopActions} style={{ gap: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
                        {onEdit && canEditCallRequest && (
                          <button className={styles.btnEdit} title="Edit Call Request" onClick={() => onEdit(call)}>
                            <PencilIcon size={16} />
                          </button>
                        )}
                        {canDeleteCallRequest && (
                          <button className={styles.btnIconDanger} title="Delete Call Request" onClick={() => onDelete(call.id)}>
                            <Trash2Icon size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.expandBtn}
                          title="Toggle actions"
                          onClick={() => toggleExpand(call.id)}
                        >
                          {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className={styles.expandedCell}>
                        <div className={styles.expandedContent}>
                          {attUrl && (
                            <div style={{ marginBottom: "0.75rem" }}>
                              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-2)", marginBottom: "4px" }}>
                                Attachment:
                              </div>
                              <FileAttachmentCell attachment={attUrl} label={call.attachment_name} />
                            </div>
                          )}
                          <div className={styles.mobileActionsBar}>
                            <button type="button" className={`${styles.btnSmall} ${styles.btnView}`} onClick={() => onView(call)}>
                              <EyeIcon size={12} /> View Details
                            </button>
                            {call.status === "PENDING" && canResolveCallRequest && (
                              <button type="button" className={`${styles.btnSmall} ${styles.btnComplete}`} onClick={() => onUpdateStatus(call.id, "COMPLETED")}>
                                <CheckCircleIcon size={12} /> Mark Done
                              </button>
                            )}
                            {call.status === "COMPLETED" && canResolveCallRequest && (
                              <button type="button" className={`${styles.btnSmall} ${styles.btnUnmark}`} onClick={() => onUpdateStatus(call.id, "PENDING")}>
                                <XCircleIcon size={12} /> Unmark
                              </button>
                            )}
                            {onEdit && canEditCallRequest && (
                              <button type="button" className={styles.btnEdit} onClick={() => onEdit(call)}>
                                <PencilIcon size={16} /> Edit
                              </button>
                            )}
                            {canDeleteCallRequest && (
                              <button type="button" className={styles.btnIconDanger} onClick={() => onDelete(call.id)}>
                                <Trash2Icon size={16} /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
