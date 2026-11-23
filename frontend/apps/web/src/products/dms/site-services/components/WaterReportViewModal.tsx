import { PrinterIcon, Edit3Icon, XIcon } from "lucide-react";
import { useShellContext } from "../../../../shell/context";
import { PrintAttachments, filesOf, usePrintAttachments } from "../../shared/print/PrintAttachments";
import { FileAttachmentCell } from "./FileAttachmentCell";
import styles from "./WaterReportViewModal.module.css";

interface Props {
  isOpen: boolean;
  report: any;
  onEdit: () => void;
  onClose: () => void;
}

export function WaterReportViewModal({ isOpen, report, onEdit, onClose }: Props) {
  // Attachments print with the report: drawn when the view opens, so Print
  // waits only for whatever is still being prepared.
  const printFiles = usePrintAttachments(filesOf(isOpen ? report : null));
  const { membership } = useShellContext();
  if (!isOpen || !report) return null;

  const displayDate = report.date || report.date_tested || "—";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()} data-print-document>
        {/* Header */}
        <div className={styles.modalHeader} data-print-hide>
          <div>
            <h3 className={styles.modalTitle}>Water Quality Report</h3>
            <span className={styles.modalSubtitle}>Date Tested: {displayDate}</span>
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
              <Edit3Icon size={13} /> Edit Report
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
              <div className={styles.bannerSubtitle}>Industrial Water & Wastewater Treatment | Water Quality Report</div>
            </div>
            <div className={styles.bannerRight}>
              <div className={styles.reportCode}>WR-{report.id}</div>
              <div className={styles.reportDate}>Date: {displayDate}</div>
            </div>
          </div>

          {/* Site Info Grid */}
          <div className={styles.infoGrid}>
            <div>
              <div className={styles.infoLabel}>Client / Site</div>
              <div className={styles.infoValue}>{report.siteName}</div>
              <div className={styles.infoSubValue}>OC Number: {report.ocNumber || 'N/A'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Date Tested</div>
              <div className={styles.infoValue}>{displayDate}</div>
            </div>
          </div>

          {/* Attachment */}
          <div>
            <h4 className={styles.sectionTitle}>
              {(report as any).attachments && Array.isArray((report as any).attachments) && (report as any).attachments.length > 1
                ? `Attached Files (${(report as any).attachments.length})`
                : "Attached Report File"}
            </h4>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(report as any).attachments && Array.isArray((report as any).attachments) && (report as any).attachments.length > 0 ? (
                (report as any).attachments.map((att: any, i: number) => (
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
            <Edit3Icon size={14} /> Edit This Report
          </button>
        </div>
      </div>
    </div>
  );
}
