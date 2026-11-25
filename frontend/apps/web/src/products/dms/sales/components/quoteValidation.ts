/**
 * What a quotation needs before it can be saved, and how to say what is wrong.
 *
 * The form is `noValidate`, so the red asterisks enforced nothing: an empty
 * bank or a malformed email went to the server, which refused it with a 422
 * whose reasons ("from_details.email: Enter a valid email address") were then
 * shown as "The submitted data is not valid." These rules mirror
 * `QuotationCreateSerializer`, so most mistakes are caught before sending; the
 * server's own field errors are mapped onto the same keys for the rest.
 */

import { asProblem } from "@xpredict/api-client";

/** Keys are the server's field paths: "from_details.email", "items.0.description". */
export type FieldErrors = Record<string, string>;

export interface QuoteDraft {
  enquiryId: string;
  title: string;
  quoteNo: string;
  isAmc: boolean;
  serviceInterval: string;
  fromName: string;
  fromAddress: string;
  fromPhone: string;
  fromEmail: string;
  toName: string;
  toAddress: string;
  toPhone: string;
  toEmail: string;
  bankId: string;
  bankCount: number;
  items: { description: string; quantity: number; base_price: number }[];
  /** Null when no agent commission is being sent. */
  commission?: { type: "PERCENTAGE" | "FIXED"; value: number } | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHONE = 20;

export function validateQuote(q: QuoteDraft): FieldErrors {
  const e: FieldErrors = {};
  const blank = (v: string) => !v || !v.trim();

  if (blank(q.enquiryId)) e.enquiry = "Select the enquiry this quote is for.";
  if (blank(q.title)) e.title = "Enter a quote title.";
  if (blank(q.quoteNo)) e.quote_no = "Enter a quote number.";
  if (q.isAmc && blank(q.serviceInterval)) e.service_interval = "Choose how often the AMC visits happen.";

  if (blank(q.fromName)) e["from_details.company_name"] = "Enter your company name.";
  if (blank(q.fromAddress)) e["from_details.address"] = "Enter your company address.";
  if (q.fromEmail.trim() && !EMAIL.test(q.fromEmail.trim()))
    e["from_details.email"] = "Enter a full email address, like info@company.com.";
  if (q.fromPhone.trim().length > MAX_PHONE)
    e["from_details.phone"] = `Phone number can be at most ${MAX_PHONE} characters.`;

  if (blank(q.toName)) e["to_details.company_name"] = "Enter the customer's name.";
  if (blank(q.toAddress)) e["to_details.address"] = "Enter the customer's billing address.";
  if (q.toEmail.trim() && !EMAIL.test(q.toEmail.trim()))
    e["to_details.email"] = "Enter a full email address, like client@domain.com.";
  if (q.toPhone.trim().length > MAX_PHONE)
    e["to_details.phone"] = `Phone number can be at most ${MAX_PHONE} characters.`;

  if (blank(q.bankId)) {
    e.selected_bank_id = q.bankCount === 0
      ? "No bank account exists yet. The owner adds one in DMS settings → Masters → Bank Accounts; then select it here."
      : "Select the bank account to print on the quote.";
  }

  if (q.items.length === 0) e.items = "Add at least one line item.";
  q.items.forEach((item, i) => {
    if (blank(item.description)) e[`items.${i}.description`] = `Line ${i + 1}: enter a description or pick a preset.`;
    if (!item.quantity || item.quantity < 1) e[`items.${i}.quantity`] = `Line ${i + 1}: quantity must be at least 1.`;
    if (Number.isNaN(item.base_price) || item.base_price < 0) e[`items.${i}.base_price`] = `Line ${i + 1}: enter a valid price.`;
  });

  if (q.commission) {
    const { type, value } = q.commission;
    if (type === "PERCENTAGE") {
      if (value < 0 || value > 100) e.commission_rate = "Commission percentage must be between 0 and 100.";
      else if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6)
        e.commission_rate = "Commission percentage can have at most 2 decimal places.";
    } else if (value < 0) {
      e.commission_rate = "Commission amount cannot be negative.";
    }
  }

  return e;
}

const LABELS: Record<string, string> = {
  title: "Quote title",
  quote_no: "Quote number",
  type: "Quote type",
  amc_type: "AMC type",
  service_interval: "Service interval",
  selected_bank_id: "Bank account",
  terms: "Terms & conditions",
  company_name: "Company name",
  contact_person: "Contact person",
  address: "Address",
  phone: "Phone number",
  email: "Email address",
  state: "State",
  gst: "GSTIN",
  pan: "PAN",
  description: "Description",
  quantity: "Quantity",
  base_price: "Price",
  margin: "Margin",
  gst_rate: "GST %",
  agent_name: "Agent name",
  commission_rate: "Agent commission",
  commission_amount: "Commission amount",
};

/** "from_details.email" -> "From (our details) – Email address"; "items.0.margin" -> "Line 1 – Margin". */
export function fieldLabel(path: string): string {
  const parts = path.split(".");
  const last = parts[parts.length - 1] ?? path;
  const name = LABELS[last] ?? last.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  if (parts[0] === "from_details") return `From (our details) – ${name}`;
  if (parts[0] === "to_details") return `To (customer) – ${name}`;
  if (parts[0] === "items" && parts.length === 3) return `Line ${Number(parts[1]) + 1} – ${name}`;
  return name;
}

/** The server's per-field reasons, keyed like `validateQuote`'s, or null if it sent none. */
export function serverFieldErrors(error: unknown): FieldErrors | null {
  const problem = asProblem(error);
  if (!problem.errors?.length) return null;
  const out: FieldErrors = {};
  for (const err of problem.errors) {
    const key = err.field && err.field !== "non_field_errors" ? err.field : "form";
    out[key] = out[key] ? `${out[key]} ${err.detail}` : err.detail;
  }
  return out;
}
