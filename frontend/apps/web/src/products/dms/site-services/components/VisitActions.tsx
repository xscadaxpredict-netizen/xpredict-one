/**
 * What can be done to one visit, by whom. The server enforces every rule
 * here; this only hides buttons that would be refused.
 *
 *   File report  -- while open and no report yet; the report's signature
 *                   is what completes the visit
 *   Open report  -- once one is filed
 *   Edit/Cancel/Delete -- managers, while open
 *   Reschedule   -- managers, on a cancelled visit: the same visit, new date
 */

import { CalendarClockIcon, CheckCircleIcon, Edit3Icon, FilePlusIcon, FileTextIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import type { ScheduleEntry } from "../api/types";
import { visitStatusInfo } from "./visitStatus";
import styles from "./ScheduleTable.module.css";

export interface VisitHandlers {
  onViewSchedule?: (visit: ScheduleEntry) => void;
  onEditSchedule?: (visit: ScheduleEntry) => void;
  onDeleteSchedule?: (visitId: string) => void;
  onFileReport?: (visit: ScheduleEntry) => void;
  onOpenReport?: (visit: ScheduleEntry) => void;
  onCancelVisit?: (visit: ScheduleEntry) => void;
  onRescheduleVisit?: (visit: ScheduleEntry) => void;
}

interface Props extends VisitHandlers {
  visit: ScheduleEntry;
  currentUserId: string;
  canEdit: boolean;
  canCancel: boolean;
  canManage: boolean;
  /** Text next to the icon, for the roomier expanded rows. */
  withLabels?: boolean;
}

export function VisitActions({
  visit, currentUserId, canEdit, canCancel, canManage, withLabels,
  onViewSchedule, onEditSchedule, onDeleteSchedule, onFileReport, onOpenReport, onCancelVisit, onRescheduleVisit,
}: Props) {
  const { closed } = visitStatusInfo(visit);
  const isMine = visit.technician_user_id === currentUserId;
  const label = (text: string) => (withLabels ? <span>{text}</span> : null);

  return (
    <>
      {onFileReport && !closed && !visit.report_id && (isMine || canManage) && (
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} title="File service report for this visit" onClick={() => onFileReport(visit)}>
          <FilePlusIcon size={14} /> {label("File report")}
        </button>
      )}
      {onOpenReport && visit.report_id && (
        <button type="button" className={styles.iconBtn} title={visit.status === "COMPLETED" ? "Signed report" : "Open report (awaiting signature)"} onClick={() => onOpenReport(visit)}>
          {visit.status === "COMPLETED" ? <CheckCircleIcon size={14} /> : <FileTextIcon size={14} />} {label("Report")}
        </button>
      )}
      {onViewSchedule && (
        <button type="button" className={styles.iconBtn} title="View details" onClick={() => onViewSchedule(visit)}>
          <FileTextIcon size={14} /> {label("Details")}
        </button>
      )}
      {onEditSchedule && canEdit && !closed && (
        <button type="button" className={styles.iconBtn} title="Edit visit" onClick={() => onEditSchedule(visit)}>
          <Edit3Icon size={14} /> {label("Edit")}
        </button>
      )}
      {onCancelVisit && canCancel && !closed && (
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Cancel visit (keeps it as history)" onClick={() => onCancelVisit(visit)}>
          <XCircleIcon size={14} /> {label("Cancel")}
        </button>
      )}
      {onRescheduleVisit && canEdit && visit.status === "CANCELLED" && (
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} title="Reschedule this visit to a new date" onClick={() => onRescheduleVisit(visit)}>
          <CalendarClockIcon size={14} /> {label("Reschedule")}
        </button>
      )}
      {onDeleteSchedule && canCancel && visit.status !== "COMPLETED" && (
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete visit" onClick={() => onDeleteSchedule(visit.id)}>
          <Trash2Icon size={14} /> {label("Delete")}
        </button>
      )}
    </>
  );
}

export function VisitStatusBadge({ visit }: { visit: ScheduleEntry }) {
  const info = visitStatusInfo(visit);
  return (
    <span
      className={`${styles.statusBadge} ${styles[`visit_${info.tone}`]}`}
      title={visit.status === "CANCELLED" && visit.cancel_reason ? `Reason: ${visit.cancel_reason}` : undefined}
    >
      {info.label}
    </span>
  );
}
