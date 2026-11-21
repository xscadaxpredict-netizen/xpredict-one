/**
 * How a visit reads to a person. The server stores four states; "Overdue" and
 * "Awaiting signature" are derived here so they are always current and never
 * need a background job.
 */

import type { ScheduleEntry } from "../api/types";
import { formatDate, formatDateTime, parseApiDate } from "../../shared/format/date";

export type VisitTone = "scheduled" | "overdue" | "progress" | "signature" | "done" | "cancelled";

export interface VisitStatusInfo {
  label: string;
  tone: VisitTone;
  /** Completed or cancelled: nothing more can be done to it. */
  closed: boolean;
}

export function visitStatusInfo(visit: ScheduleEntry, today: Date = new Date()): VisitStatusInfo {
  switch (visit.status) {
    case "COMPLETED":
      return { label: "Completed", tone: "done", closed: true };
    case "CANCELLED":
      return { label: "Cancelled", tone: "cancelled", closed: true };
    case "IN_PROGRESS":
      return visit.report_status === "AWAITING_CLIENT_SIGN"
        ? { label: "Awaiting client signature", tone: "signature", closed: false }
        : { label: "In progress", tone: "progress", closed: false };
    default: {
      const date = parseApiDate(visit.scheduled_date);
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      if (date && date.getTime() < start.getTime()) {
        const days = Math.round((start.getTime() - date.getTime()) / 86_400_000);
        return { label: `Overdue by ${days}d`, tone: "overdue", closed: false };
      }
      return { label: "Scheduled", tone: "scheduled", closed: false };
    }
  }
}

/** The visit's history as sentences, oldest first, for the row and the details view. */
export function visitHistoryLines(visit: ScheduleEntry): string[] {
  return (visit.history || []).map((h) =>
    h.event === "cancelled"
      ? `Cancelled ${formatDateTime(h.at)} (was due ${formatDate(h.date)})${h.reason ? `: ${h.reason}` : ""}`
      : `Rescheduled ${formatDateTime(h.at)} from ${formatDate(h.from_date)} to ${formatDate(h.to_date)}`,
  );
}
