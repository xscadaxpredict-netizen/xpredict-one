import { XIcon, MessageCircleIcon, PhoneIcon, MailIcon, UserIcon, CheckCircleIcon } from "lucide-react";
import type { RequestCall } from "../api/types";
import styles from "./CallDetailDialog.module.css";

interface Props {
  isOpen: boolean;
  call: RequestCall | null;
  onUpdateStatus: (id: string, status: "PENDING" | "COMPLETED" | "CANCELLED") => void;
  onClose: () => void;
}

export function CallDetailDialog({ isOpen, call, onUpdateStatus, onClose }: Props) {
  if (!isOpen || !call) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Callback Request Details</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailCard}>
            <div className={styles.detailRow}>
              <div className={styles.detailIcon}><UserIcon size={18} /></div>
              <div className={styles.detailContent}>
                <div className={styles.detailLabel}>Customer Name</div>
                <div className={styles.detailValue}>{call.name}</div>
              </div>
            </div>
            
            <div className={styles.detailRow}>
              <div className={styles.detailIcon}><PhoneIcon size={18} /></div>
              <div className={styles.detailContent}>
                <div className={styles.detailLabel}>Phone Number</div>
                <div className={styles.detailValue}><a href={`tel:${call.phone}`} className={styles.link}>{call.phone}</a></div>
              </div>
            </div>
            
            <div className={styles.detailRow}>
              <div className={styles.detailIcon}><MailIcon size={18} /></div>
              <div className={styles.detailContent}>
                <div className={styles.detailLabel}>Email Address</div>
                <div className={styles.detailValue}><a href={`mailto:${call.email}`} className={styles.link}>{call.email}</a></div>
              </div>
            </div>

            <div className={styles.divider}></div>
            
            <div className={styles.detailRow}>
              <div className={styles.detailContent}>
                <div className={styles.detailLabel}>Date Logged</div>
                <div className={styles.detailValue}>{call.date}</div>
              </div>
            </div>

            <div className={styles.detailRow}>
              <div className={styles.detailContent}>
                <div className={styles.detailLabel}>Current Status</div>
                <div className={styles.detailValue}>
                  <span className={`${styles.badge} ${call.status === "PENDING" ? styles.badgePending : call.status === "COMPLETED" ? styles.badgeCompleted : styles.badgeCancelled}`}>
                    {call.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className={styles.messageBox}>
            <div className={styles.messageHeader}>
              <MessageCircleIcon size={16} />
              <span>Subject: {call.subject}</span>
            </div>
            <div className={styles.messageBody}>
              {call.message}
            </div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Close</button>
          {call.status === "PENDING" && (
            <button className={styles.btnSuccess} onClick={() => { onUpdateStatus(call.id, "COMPLETED"); onClose(); }}>
              <CheckCircleIcon size={16} /> Mark as Completed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
