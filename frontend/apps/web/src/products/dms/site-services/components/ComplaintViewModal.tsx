import { PrinterIcon, Edit3Icon, XIcon } from "lucide-react";
import { useShellContext } from "../../../../shell/context";
import { PrintAttachments, filesOf, usePrintAttachments } from "../../shared/print/PrintAttachments";
import { FileAttachmentCell } from "./FileAttachmentCell";
import { formatDateTime } from "../../shared/format/date";
import { COMPLAINT_STATUS_LABEL } from "./ComplaintActions";
import styles from "./ComplaintViewModal.module.css";

interface Props {
  isOpen: boolean;
  report: any;
  onEdit: () => void;
  onToggleStatus?: () => void;
  onClose: () => void;
}

export function ComplaintViewModal({ isOpen, report, onEdit, onToggleStatus, onClose }: Props) {
  // Attachments print with the report: drawn when the view opens, so Print
  // waits only for whatever is still being prepared.
  const printFiles = usePrintAttachments(filesOf(isOpen ? report : null));
  const { membership } = useShellContext();
  if (!isOpen || !report) return null;

  const displayDate = report.date || report.created_at?.split("T")[0] || "—";
  const isResolved = report.status === "RESOLVED";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()} data-print-document>
        {/* Header */}
        <div className={styles.modalHeader} data-print-hide>
          <div>
            <h3 className={styles.modalTitle}>Complaint / Ticket #{report.id}</h3>
            <span className={styles.modalSubtitle}>Filed on: {displayDate}</span>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => window.print()}
              disabled={!printFiles.ready}
              title={printFiles.ready ? undefined : "Preparing the attachments for printing"}
            >
              <PrinterIcon size={13} /> {printFiles.ready ? "Print" : "Preparing print..."}
            </button>
            <button type="button" className={styles.btnPrimary} onClick={onEdit}>
              <Edit3Icon size={13} /> Edit Ticket
            </button>
            <button type="button" className={styles.modalClose} onClick={onClose}>
              <XIcon size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Company Banner */}
          <div className={styles.bannerContainer}>
            <div>
              {/* Whose report this is: the site's dealership, or the organisation for its own site. */}
              <div className={styles.bannerTitle}>{(report.company_name || membership.org_name || "").toUpperCase()}</div>
              <div className={styles.bannerSubtitle}>Industrial Water & Wastewater Treatment | Support Ticket</div>
            </div>
            <div className={styles.bannerRight}>
              <div className={styles.reportCode}>{report.id}</div>
              <div className={styles.reportDate}>Date: {displayDate}</div>
            </div>
          </div>

          {/* Site & Status Grid */}
          <div className={styles.infoGrid}>
            <div>
              <div className={styles.infoLabel}>Client / Site</div>
              <div className={styles.infoValue}>{report.siteName}</div>
              <div className={styles.infoSubValue}>OC: {report.ocNumber || 'N/A'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Service Person</div>
              <div className={styles.infoValue}>{report.assigned_service_person_name || report.servicePersonName || report.personName || '—'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Ticket Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                <span className={`${styles.badge} ${styles["status" + report.status]}`}>
                  {COMPLAINT_STATUS_LABEL[report.status as keyof typeof COMPLAINT_STATUS_LABEL] ?? report.status}
                </span>
              </div>
            </div>
          </div>

          {/* Issue Description */}
          <div>
            <h4 className={styles.sectionTitle}>Issue Description</h4>
            <div className={styles.issueBox}>
              {report.issue || report.description || 'No description provided.'}
            </div>
          </div>

          {report.resolution_notes && (
            <div>
              <h4 className={styles.sectionTitle}>
                Resolution{report.resolved_at ? ` · ${formatDateTime(report.resolved_at)}` : ""}
              </h4>
              <div className={styles.issueBox}>{report.resolution_notes}</div>
            </div>
          )}

          {/* Priority */}
          <div>
            <h4 className={styles.sectionTitle}>Priority Level</h4>
            <span className={`${styles.badge} ${styles["priority" + report.priority]}`}>
              {report.priority || 'Normal'}
            </span>
          </div>

          {/* Attachment */}
          <div style={{ marginTop: '1rem' }}>
            <h4 className={styles.sectionTitle}>
              {report.attachments && Array.isArray(report.attachments) && report.attachments.length > 1
                ? `Attached Files (${report.attachments.length})`
                : "Attached File"}
            </h4>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {report.attachments && Array.isArray(report.attachments) && report.attachments.length > 0 ? (
                report.attachments.map((att: any, i: number) => (
                  <FileAttachmentCell key={i} attachment={typeof att === "string" ? att : (att.file || att)} />
                ))
              ) : (
                <FileAttachmentCell attachment={report.attachment} />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <PrintAttachments prepared={printFiles.prepared} />

        <div data-print-hide className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Close</button>
          <button type="button" className={styles.btnPrimary} onClick={onEdit}>
            <Edit3Icon size={14} /> Edit This Ticket
          </button>
          {onToggleStatus && (
            <button
              type="button"
              className={isResolved ? styles.btnSecondary : styles.btnPrimary}
              style={{ background: isResolved ? "#f59e0b" : "#10b981", color: "white", border: "none" }}
              onClick={onToggleStatus}
            >
              {isResolved ? "Unresolve / Reopen Ticket" : "Mark as Resolved"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
