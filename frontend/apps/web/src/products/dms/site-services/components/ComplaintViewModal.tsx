import { PrinterIcon, Edit3Icon, XIcon } from "lucide-react";
import styles from "./ComplaintViewModal.module.css";

interface Props {
  isOpen: boolean;
  report: any;
  onEdit: () => void;
  onClose: () => void;
}

export function ComplaintViewModal({ isOpen, report, onEdit, onClose }: Props) {
  if (!isOpen || !report) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Complaint / Ticket #{report.id}</h3>
            <span className={styles.modalSubtitle}>Filed on: {report.date}</span>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
              <PrinterIcon size={13} /> Print
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
              <div className={styles.bannerTitle}>XPREDICT AUTOMATION SOLUTIONS PVT LTD</div>
              <div className={styles.bannerSubtitle}>Industrial Water & Wastewater Treatment | Complaint Ticket</div>
            </div>
            <div className={styles.bannerRight}>
              <div className={styles.reportCode}>{report.id}</div>
              <div className={styles.reportDate}>Date: {report.date}</div>
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
              <div className={styles.infoValue}>{report.servicePersonName || report.personName || '—'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Ticket Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                <span className={`${styles.badge} ${styles["status" + report.status]}`}>
                  {report.status}
                </span>
              </div>
            </div>
          </div>

          {/* Issue Description */}
          <div>
            <h4 className={styles.sectionTitle}>Issue Description</h4>
            <div className={styles.issueBox}>
              {report.issue || 'No description provided.'}
            </div>
          </div>

          {/* Priority */}
          <div>
            <h4 className={styles.sectionTitle}>Priority Level</h4>
            <span className={`${styles.badge} ${styles["priority" + report.priority]}`}>
              {report.priority || 'Normal'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Close</button>
          <button type="button" className={styles.btnPrimary} onClick={onEdit}>
            <Edit3Icon size={14} /> Edit This Ticket
          </button>
          <button type="button" className={styles.btnDanger} onClick={() => { alert(report.status === 'OPEN' ? 'Marked as Resolved!' : 'Reopened!'); onClose(); }}>
            {report.status === 'OPEN' ? 'Mark Resolved' : 'Reopen Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
