/**
 * A service interval as people type it, in days.
 *
 * AMC quotes store the interval as free text ("3 Months", "10 days", "1 year",
 * "30"). The schedule used to `parseInt` it, which read "3 Months" as 3 DAYS.
 *
 *   intervalToDays("3 Months") -> 90     intervalToDays("2 weeks") -> 14
 *   intervalToDays("10 days")  -> 10     intervalToDays("30")      -> 30   (bare number = days)
 *   intervalToDays("monthly")  -> 30     intervalToDays("")        -> null
 *
 * Months count as 30 days and years as 365: an interval is a reminder, not a
 * calendar contract, and a fixed length keeps the next date predictable.
 */

const UNIT_DAYS: Array<[RegExp, number]> = [
  [/^(d|day|days)$/, 1],
  [/^(w|wk|wks|week|weeks)$/, 7],
  [/^(m|mo|mon|mons|month|months)$/, 30],
  [/^(y|yr|yrs|year|years)$/, 365],
];

const WORDS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
  "half-yearly": 182,
  halfyearly: 182,
  yearly: 365,
  annually: 365,
  annual: 365,
};

export function intervalToDays(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value > 0 ? Math.round(value) : null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  const word = WORDS[text];
  if (word !== undefined) return word;

  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)\.?$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const unit = m[2] ?? "";
  if (!unit) return Math.round(n);
  const match = UNIT_DAYS.find(([re]) => re.test(unit));
  return match ? Math.round(n * match[1]) : null;
}
