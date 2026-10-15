/**
 * Status badge for enquiry status (PENDING / CONFIRMED / LOST).
 *
 * Uses semantic tokens — never raw hex codes.
 */

import type { EnquiryStatus } from "../api/types";
import styles from "./StatusBadge.module.css";

interface StatusBadgeProps {
  status: EnquiryStatus;
}

const LABELS: Record<EnquiryStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Won",
  LOST: "Lost",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={styles.badge} data-status={status.toLowerCase()}>
      {LABELS[status]}
    </span>
  );
}
