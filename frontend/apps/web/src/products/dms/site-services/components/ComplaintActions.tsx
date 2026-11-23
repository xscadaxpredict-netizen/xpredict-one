/**
 * Moving a complaint along, and who may. Mirrors `set_complaint_status` on
 * the server, which enforces every rule; this only hides what it would refuse.
 *
 *   Start work / Resolve -- the assigned person, or a manager
 *   Close                -- a manager, once it is resolved
 *   Reopen               -- a manager, or whoever raised it
 */

import { CheckCircle2Icon, LockIcon, PlayCircleIcon, RotateCcwIcon } from "lucide-react";
import type { ComplaintStatus } from "../api/types";
import styles from "./ComplaintTable.module.css";

export type ComplaintMove = "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "OPEN";

interface Props {
  complaint: {
    status: ComplaintStatus;
    assigned_service_person_user_id?: string | null;
    complainant_user_id?: string | null;
  };
  currentUserId: string;
  canManage: boolean;
  onMove: (status: ComplaintMove) => void;
  withLabels?: boolean;
}

export function ComplaintActions({ complaint, currentUserId, canManage, onMove, withLabels }: Props) {
  const isAssignee = complaint.assigned_service_person_user_id === currentUserId;
  const raisedIt = complaint.complainant_user_id === currentUserId;
  const works = canManage || isAssignee;
  const label = (text: string) => (withLabels ? <span>{text}</span> : null);
  const s = complaint.status;

  return (
    <>
      {works && s === "OPEN" && (
        <button type="button" className={styles.iconBtn} style={{ color: "#b45309" }} title="Start work" onClick={() => onMove("IN_PROGRESS")}>
          <PlayCircleIcon size={16} /> {label("Start work")}
        </button>
      )}
      {works && (s === "OPEN" || s === "IN_PROGRESS") && (
        <button type="button" className={styles.iconBtn} style={{ color: "#10b981" }} title="Mark as resolved" onClick={() => onMove("RESOLVED")}>
          <CheckCircle2Icon size={16} /> {label("Resolve")}
        </button>
      )}
      {canManage && s === "RESOLVED" && (
        <button type="button" className={styles.iconBtn} style={{ color: "#475569" }} title="Close (checked and done)" onClick={() => onMove("CLOSED")}>
          <LockIcon size={16} /> {label("Close")}
        </button>
      )}
      {(canManage || raisedIt) && (s === "RESOLVED" || s === "CLOSED") && (
        <button type="button" className={styles.iconBtn} style={{ color: "#f59e0b" }} title="Reopen" onClick={() => onMove("OPEN")}>
          <RotateCcwIcon size={16} /> {label("Reopen")}
        </button>
      )}
    </>
  );
}

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
