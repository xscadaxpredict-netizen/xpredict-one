/**
 * An amount in rupees, written out the way an Indian quotation or invoice
 * states it: lakh and crore, not million and billion.
 *
 *   amountInWords(920400)    -> "Rupees Nine Lakh Twenty Thousand Four Hundred Only"
 *   amountInWords(1250.5)    -> "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only"
 *
 * Rounds to the nearest paisa first, so 0.999 is "One Rupee", not 99.9 paise.
 * Negative or non-finite input yields an empty string --- a quotation total is
 * never negative, and printing "Minus ..." on a customer document would hide a bug.
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99 */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const o = ONES[n % 10] ?? "";
  return o ? `${t} ${o}` : t;
}

/** 0–999 */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h] ?? ""} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Whole number in the Indian system. 0 -> "Zero". */
export function integerToIndianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  // Above 99 crore the crore count itself is read in the Indian system
  // ("One Hundred Twenty Crore"), which this recursion gives for free.
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  const totalPaise = Math.round(amount * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  // Indian invoices say "Rupees One Only", singular or not.
  const rupeeWords = `Rupees ${integerToIndianWords(rupees)}`;
  if (!paise) return `${rupeeWords} Only`;
  const paiseWords = `${twoDigits(paise)} ${paise === 1 ? "Paisa" : "Paise"}`;
  if (!rupees) return `${paiseWords} Only`;
  return `${rupeeWords} and ${paiseWords} Only`;
}
