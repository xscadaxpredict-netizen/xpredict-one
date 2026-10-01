import { PrinterIcon, Edit3Icon, XIcon } from "lucide-react";
import styles from "./WaterReportViewModal.module.css";

interface Props {
  isOpen: boolean;
  report: any;
  onEdit: () => void;
  onClose: () => void;
}

export function WaterReportViewModal({ isOpen, report, onEdit, onClose }: Props) {
  if (!isOpen || !report) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Water Quality Report</h3>
            <span className={styles.modalSubtitle}>Date Tested: {report.date}</span>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
              <PrinterIcon size={13} /> Print
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
              <div className={styles.bannerTitle}>XPREDICT AUTOMATION SOLUTIONS PVT LTD</div>
              <div className={styles.bannerSubtitle}>Industrial Water & Wastewater Treatment | Water Quality Report</div>
            </div>
            <div className={styles.bannerRight}>
              <div className={styles.reportCode}>WR-{report.id}</div>
              <div className={styles.reportDate}>Date: {report.date}</div>
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
              <div className={styles.infoValue}>{report.date}</div>
            </div>
          </div>

          {/* Attachment */}
          <div>
            <h4 className={styles.sectionTitle}>Attached Report File</h4>
            <div className={styles.attachmentBox}>
              {report.attachment || 'No file attached.'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Close</button>
          <button type="button" className={styles.btnPrimary} onClick={onEdit}>
            <Edit3Icon size={14} /> Edit This Report
          </button>
        </div>
      </div>
    </div>
  );
}
