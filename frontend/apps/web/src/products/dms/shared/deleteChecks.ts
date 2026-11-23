/**
 * Turns a dependency report from the backend into what the delete dialog says.
 *
 * The backend decides what depends on a record and what happens to it; this
 * only words it. `confirm` is passed back on the DELETE so the backend knows
 * the user saw the dependents --- without it, it refuses a delete that has any.
 */

import type { QuotationDependencies } from "../sales/api/types";
import type { ScheduleDependencies } from "../site-services/api/types";

export interface DeletePlan {
  /** Cannot be deleted at all; show this and stop. */
  blocked: string | null;
  /** The confirmation text. Lines are separated by "\n". */
  message: string;
  /** Send `confirm=true` with the delete. */
  confirm: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const CANNOT_UNDO = "This cannot be undone.";

export function planQuotationDelete(deps: QuotationDependencies): DeletePlan {
  if (deps.blocked_reason) {
    return { blocked: deps.blocked_reason, message: "", confirm: false };
  }
  if (!deps.has_dependents) {
    return {
      blocked: null,
      message: `Are you sure you want to delete this quote? ${CANNOT_UNDO}`,
      confirm: false,
    };
  }

  const lines: string[] = [];
  if (deps.is_confirmed) {
    lines.push(
      deps.quote_type === "AMC"
        ? "This is a confirmed AMC. The site will no longer have an active AMC."
        : "This quotation is confirmed.",
    );
  }
  if (deps.upcoming_visits) {
    lines.push(`${plural(deps.upcoming_visits, "upcoming service visit", "upcoming service visits")} booked under it will be cancelled.`);
  }
  if (deps.past_visits) {
    lines.push(`${plural(deps.past_visits, "past visit", "past visits")} and their service reports will be kept.`);
  }
  if (deps.techno_commercial_documents) {
    lines.push(
      `${plural(deps.techno_commercial_documents, "techno-commercial document", "techno-commercial documents")} will be kept but no longer linked to this quote.`,
    );
  }
  return {
    blocked: null,
    message: `Deleting this quote:\n${lines.map((l) => `• ${l}`).join("\n")}\n\n${CANNOT_UNDO}`,
    confirm: true,
  };
}

export function planScheduleDelete(deps: ScheduleDependencies): DeletePlan {
  if (!deps.service_reports) {
    return { blocked: null, message: `Delete this scheduled visit? ${CANNOT_UNDO}`, confirm: false };
  }
  return {
    blocked: null,
    message:
      `This visit has ${plural(deps.service_reports, "service report", "service reports")}. ` +
      `${deps.service_reports === 1 ? "It" : "They"} will be kept under Service Reports, but no longer linked to this visit.\n\n` +
      `Delete the visit? ${CANNOT_UNDO}`,
    confirm: true,
  };
}
