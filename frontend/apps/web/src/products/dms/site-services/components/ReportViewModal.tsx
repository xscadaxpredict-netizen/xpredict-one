import { PrinterIcon, Edit3Icon, XIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import { FileAttachmentCell } from "./FileAttachmentCell";
import styles from "./ReportViewModal.module.css";

import { useDialog } from "../../shared/hooks/useDialog";

interface Props {
  isOpen: boolean;
  report: any;
  onEdit: () => void;
  onClose: () => void;
  onApprove?: (reportId: string, remarks?: string) => void;
  onReject?: (reportId: string, remarks?: string) => void;
}

export function ReportViewModal({ isOpen, report, onEdit, onClose, onApprove, onReject }: Props) {
  const { showPrompt, showAlert, DialogComponent } = useDialog();

  if (!isOpen || !report) return null;

  const handleApprove = () => {
    if (onApprove) {
      onApprove(report.id, "");
    }
  };

  const handleReject = async () => {
    if (onReject) {
      const remarks = await showPrompt("Reject Report", "Enter reason for rejection:");
      if (!remarks) {
        showAlert("Error", "Rejection remarks are required!");
        return;
      }
      onReject(report.id, remarks);
    }
  };

  const servicePersonSig = report.service_person_signature || "";
  const clientSig = report.client_signature || "";
  const approvalStatus = report.client_approval_status || "PENDING";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Service Report #{report.report_code || report.id}</h3>
            <span className={styles.modalSubtitle}>Service Date: {report.service_date || report.date || 'N/A'}</span>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
              <PrinterIcon size={13} /> Print Report
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
              <div className={styles.reportDate}>Date: {report.service_date || report.date}</div>
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
              <div className={styles.infoValue}>{report.technician_display_name || report.technician || 'Unassigned'}</div>
              <div className={styles.infoSubValue}>Zone: {report.zone || 'General'}</div>
            </div>
            <div>
              <div className={styles.infoLabel}>Approval Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                {approvalStatus === 'APPROVED' ? (
                  <span className={`${styles.statusBadge} ${styles.statusCompleted}`}>
                    ✓ Approved
                  </span>
                ) : approvalStatus === 'REJECTED' ? (
                  <span className={`${styles.statusBadge}`} style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    ✕ Rejected
                  </span>
                ) : (
                  <span className={`${styles.statusBadge} ${styles.statusPending}`}>
                    ⏳ Pending Review
                  </span>
                )}
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

          {/* Attachments Section */}
          <div>
            <h4 className={styles.sectionTitle}>Attachments & Media Proof</h4>
            {report.attachments && report.attachments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {report.attachments.map((att: any) => (
                  <FileAttachmentCell key={att.id || att.file} attachment={att.file} label={att.file_name} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-2)', fontStyle: 'italic' }}>
                No attachments uploaded for this report.
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className={styles.signaturesSection}>
            <h4 className={styles.sectionTitle}>Signatures & Authorizations</h4>
            <div className={styles.signaturesGrid}>
              <div className={styles.signatureBox}>
                <div className={styles.signatureLabel}>Service Engineer / Technician</div>
                <div className={styles.signaturePlaceholder}>
                  {servicePersonSig ? (
                    <img src={servicePersonSig} alt="Service Person Signature" style={{ maxHeight: "60px", maxWidth: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#94A3B8" }}>No Signature Image</span>
                  )}
                </div>
                <div className={styles.signatureName}>{report.service_person_name || report.technician_display_name || report.technician || 'Service Personnel'}</div>
                <div className={styles.signatureRole}>Service Personnel</div>
              </div>
              <div className={styles.signatureBox}>
                <div className={styles.signatureLabel}>Customer / Facility Head</div>
                <div className={styles.signaturePlaceholder}>
                  {clientSig ? (
                    <img src={clientSig} alt="Client Signature" style={{ maxHeight: "60px", maxWidth: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#D97706" }}>⏳ Awaiting Client Signature</span>
                  )}
                </div>
                <div className={styles.signatureName}>{report.client_name || 'Client Representative'}</div>
                <div className={styles.signatureRole}>Authorized Client Signatory</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter} style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            {onApprove && approvalStatus !== "APPROVED" && (
              <button type="button" className={styles.btnPrimary} style={{ background: "#16A34A" }} onClick={handleApprove}>
                <CheckCircleIcon size={14} /> Approve Report
              </button>
            )}
            {onReject && approvalStatus !== "REJECTED" && (
              <button type="button" className={styles.btnSecondary} style={{ color: "#DC2626", borderColor: "#FECACA" }} onClick={handleReject}>
                <XCircleIcon size={14} /> Reject Report
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Close</button>
            <button type="button" className={styles.btnPrimary} onClick={onEdit}>
              <Edit3Icon size={14} /> Edit This Report
            </button>
          </div>
        </div>
      </div>
      <DialogComponent />
    </div>
  );
}
