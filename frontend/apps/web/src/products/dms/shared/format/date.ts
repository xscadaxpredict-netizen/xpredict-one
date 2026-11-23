/**
 * Dates for people, not machines.
 *
 * The API sends timestamps as ISO 8601 in UTC ("2026-11-07T13:01:13.894873Z")
 * and calendar dates as "2026-11-07". Neither is fit to show a customer, and
 * the first is also in the wrong time zone. Everything here renders in the
 * browser's local time --- IST for an Indian dealership.
 *
 *   formatDate("2026-11-07T13:01:13.894873Z")      -> "07 Nov 2026"
 *   formatDate("2026-11-07")                       -> "07 Nov 2026"
 *   formatDateTime("2026-11-07T13:01:13.894873Z")  -> "07 Nov 2026, 6:31 PM"  (in IST)
 *
 * Built by hand rather than with toLocaleDateString, so the output is the same
 * in every browser and in tests, whatever locale data they ship.
 *
 * Anything that is not a date is returned unchanged rather than as
 * "Invalid Date", and empty input gives the placeholder.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-11-07" is a calendar date, not an instant. `new Date("2026-11-07")`
 * reads it as UTC midnight, which is the previous day anywhere west of UTC ---
 * so it is built from its parts, in local time, instead.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = DATE_ONLY.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateParts(d: Date): string {
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

export function formatDate(value: string | null | undefined, placeholder = "—"): string {
  if (!value) return placeholder;
  const d = parseApiDate(value);
  return d ? dateParts(d) : value;
}

export function formatDateTime(value: string | null | undefined, placeholder = "—"): string {
  if (!value) return placeholder;
  const d = parseApiDate(value);
  if (!d) return value;
  // A bare calendar date has no time to show.
  if (DATE_ONLY.test(value)) return dateParts(d);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dateParts(d)}, ${h12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** The date `days` after `value`, formatted --- e.g. a quotation's validity. */
export function formatDatePlusDays(
  value: string | null | undefined,
  days: number,
  placeholder = "—",
): string {
  const d = parseApiDate(value);
  if (!d) return placeholder;
  const later = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return dateParts(later);
}
