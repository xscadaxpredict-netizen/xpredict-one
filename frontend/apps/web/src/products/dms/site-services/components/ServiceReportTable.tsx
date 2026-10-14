import { Fragment, useState } from "react";
import { ClockIcon, MapPinIcon, CalendarIcon, UserIcon, CheckIcon, EyeIcon, CheckCircleIcon, AlertCircleIcon, Edit3Icon, Trash2Icon, FileTextIcon, LinkIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { FileAttachmentCell } from "./FileAttachmentCell";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./ServiceReportTable.module.css";

interface Props {
  reports: any[];
  onView: (report: any) => void;
  onEdit: (report: any) => void;
  onDelete: (id: string) => void;
  onShare: (report: any) => void;
}

export function ServiceReportTable({ reports, onView, onEdit, onDelete, onShare }: Props) {
  const { canEditReport, canSignReport, canDeleteReport } = useDmsPermissions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (reports.length === 0) {
    return (
      <div className={styles.emptyState}>
        <FileTextIcon size={36} className={styles.emptyIcon} />
        <div>No Service Reports Found</div>
        <div className={styles.muted}>Click "New Report" to record a site visit.</div>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Report ID & Time</th>
            <th className={styles.th}>Site & Zone</th>
            <th className={styles.th}>Service Date & Tech</th>
            <th className={styles.th}>Remarks & Attachments</th>
            <th className={styles.th}>Client Sign & Approval</th>
            <th className={styles.thRight}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const hasAttachments = report.attachments && report.attachments.length > 0;
            const techName = report.technician_display_name || report.technician || "Unassigned";
            const serviceDate = report.service_date || report.date || "N/A";
            const approvalStatus = report.client_approval_status || "PENDING";
            const isExpanded = expandedId === report.id;

            return (
              <Fragment key={report.id}>
                <tr className={styles.row} onClick={() => toggleExpand(report.id)} style={{ cursor: "pointer" }}>
                  <td className={styles.td}>
                    <div className={styles.bold} style={{ fontSize: "0.88rem" }}>{report.report_code || "SR-NEW"}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--color-text-2)', background: 'var(--color-surface-alt)', padding: '0.15rem 0.45rem', borderRadius: '4px', marginTop: '0.3rem' }}>
                      <ClockIcon size={11} /> Logged
                    </div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.bold}>{report.siteName}</div>
                    <div className={styles.muted} style={{ fontSize: "0.75rem" }}>OC: {report.ocNumber || "N/A"}</div>
                    {report.zone && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '999px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #DBEAFE' }}>
                        <MapPinIcon size={10} /> {report.zone}
                      </span>
                    )}
                  </td>
                  <td className={styles.td}>
                    <div className={styles.bold} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CalendarIcon size={13} color="var(--color-primary)" /> {serviceDate}
                    </div>
                    <div className={styles.muted} style={{ fontSize: '0.78rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <UserIcon size={12} /> {techName}
                    </div>
                    {report.service_person_signature && (
                      <span style={{ fontSize: '0.7rem', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}>
                        <CheckIcon size={10} /> Tech Signed ({report.service_person_name || techName})
                      </span>
                    )}
                  </td>
                  <td className={styles.td} style={{ maxWidth: '260px' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.35rem' }}>
                      {report.remarks || "No remarks"}
                    </div>
                    {hasAttachments ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {report.attachments.map((att: any) => (
                          <FileAttachmentCell key={att.id || att.file} attachment={att.file} label={att.file_name} />
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--color-text-3)" }}>No attachments</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {report.status === "COMPLETED" || report.client_signature ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                          <CheckCircleIcon size={12} /> Client Signed ({report.client_name || "Signed"})
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
                          <AlertCircleIcon size={11} /> Awaiting Client Sign
                        </span>
                      )}

                      {approvalStatus === "APPROVED" ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#DCFCE7', color: '#15803D' }}>
                          ✓ Approved
                        </span>
                      ) : approvalStatus === "REJECTED" ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#FEE2E2', color: '#B91C1C', alignSelf: 'flex-start' }}>
                            ✕ Rejected
                          </span>
                          {report.approval_remarks && (
                             <div style={{ fontSize: '0.72rem', color: '#B91C1C', whiteSpace: 'normal', lineHeight: 1.2 }}>Reason: {report.approval_remarks}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Approval: Pending</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.tdRight} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                      <button type="button" className={styles.iconBtn} title="View Report" onClick={() => onView(report)}>
                        <EyeIcon size={16} />
                      </button>
                      {canSignReport && (
                        <button type="button" className={styles.iconBtn} title="Generate Sign Link" style={{ color: "#8B5CF6" }} onClick={() => onShare(report)}>
                          <LinkIcon size={16} />
                        </button>
                      )}
                      {canEditReport && (
                        <button type="button" className={styles.iconBtn} title="Edit Report" style={{ color: "var(--color-primary)" }} onClick={() => onEdit(report)}>
                          <Edit3Icon size={16} />
                        </button>
                      )}
                      {canDeleteReport && (
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
                    <td colSpan={6} className={styles.expandedCell}>
                      <div className={styles.expandedContent}>
                        <div className={styles.mobileActionsBar}>
                          <button type="button" className={styles.iconBtn} onClick={() => onView(report)}>
                            <EyeIcon size={16} /> <span>View</span>
                          </button>
                          {canSignReport && (
                            <button type="button" className={styles.iconBtn} style={{ color: "#8B5CF6" }} onClick={() => onShare(report)}>
                              <LinkIcon size={16} /> <span>Share Sign Link</span>
                            </button>
                          )}
                          {canEditReport && (
                            <button type="button" className={styles.iconBtn} style={{ color: "var(--color-primary)" }} onClick={() => onEdit(report)}>
                              <Edit3Icon size={16} /> <span>Edit</span>
                            </button>
                          )}
                          {canDeleteReport && (
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



