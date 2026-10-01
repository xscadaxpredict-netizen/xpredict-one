import { PrinterIcon, Edit3Icon, XIcon } from "lucide-react";
import styles from "./ReportViewModal.module.css";

interface Props {
  isOpen: boolean;
  report: any;
  onEdit: () => void;
  onClose: () => void;
}

export function ReportViewModal({ isOpen, report, onEdit, onClose }: Props) {
  if (!isOpen || !report) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Service Report #{report.report_code || report.id}</h3>
            <span className={styles.modalSubtitle}>Uploaded on: {report.uploadedAt || 'N/A'}</span>
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
              <div className={styles.bannerSubtitle}>Industrial Water & Wastewater Treatment | DMS Service Report</div>
            </div>
            <div className={styles.bannerRight}>
              <div className={styles.reportCode}>{report.report_code || `SR-${report.id}`}</div>
              <div className={styles.reportDate}>Date: {report.date}</div>
            </div>
          </div>

          {/* Site & Tech Grid */}
          <div className={styles.infoGrid}>
            <div>
              <div className={styles.infoLabel}>Client / Site</div>
              <div className={styles.infoValue}>{report.siteName}</div>
              <div className={styles.infoSubValue}>OC Number: {report.ocNumber || 'N/A'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Technician & Zone</div>
              <div className={styles.infoValue}>{report.technician}</div>
              <div className={styles.infoSubValue}>Zone: {report.zone || 'General'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Report Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                <span className={`${styles.statusBadge} ${report.status === 'COMPLETED' ? styles.statusCompleted : styles.statusPending}`}>
                  {report.status === 'COMPLETED' ? '✓ Signed & Finalized' : '⏳ Awaiting Client Signature'}
                </span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <h4 className={styles.sectionTitle}>Service Observations & Work Done</h4>
            <div className={styles.remarksBox}>
              {report.remarks || 'Standard preventive maintenance completed.'}
            </div>
          </div>

          {/* Signatures */}
          <div className={styles.signaturesSection}>
            <h4 className={styles.sectionTitle}>Signatures & Authorizations</h4>
            <div className={styles.signaturesGrid}>
              <div className={styles.signatureBox}>
                <div className={styles.signatureLabel}>Service Engineer / Technician</div>
                <div className={styles.signaturePlaceholder}>Signature Available</div>
                <div className={styles.signatureName}>{report.technician}</div>
                <div className={styles.signatureRole}>Service Personnel</div>
              </div>
              <div className={styles.signatureBox}>
                <div className={styles.signatureLabel}>Customer / Facility Head</div>
                {report.status === 'COMPLETED' ? (
                  <div className={styles.signatureSuccess}>✓ Client Signed</div>
                ) : (
                  <div className={styles.signaturePending}>
                    <span>⏳ Awaiting Client Signature</span>
                    <button type="button" className={styles.btnSecondarySmall}>Copy Sign Link</button>
                  </div>
                )}
                <div className={styles.signatureName}>Client Representative</div>
                <div className={styles.signatureRole}>Authorized Client Signatory</div>
              </div>
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
