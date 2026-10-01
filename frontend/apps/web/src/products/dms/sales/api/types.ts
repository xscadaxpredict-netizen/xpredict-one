/**
 * Sales module types.
 *
 * These mirror the backend's serializer output. Field names use snake_case to
 * match the JSON the API will send — converting at the boundary creates two
 * vocabularies for the same field, and the mapping drifts the moment somebody
 * adds one without updating the other.
 */

// ---- Enquiry ---------------------------------------------------------------

export type EnquiryStatus = "PENDING" | "CONFIRMED" | "LOST";

export interface Enquiry {
  id: string;
  customer_name: string;
  contact_person: string;
  address: string;
  pincode: string;
  phone: string;
  remarks: string;
  status: EnquiryStatus;
  confirmed_quote_id: string | null;
  oc_number: string | null;
  followups: Followup[];
  quotes: Quotation[];
  site_details?: SiteDetails | null;
  service_reports?: ServiceReport[];
  water_reports?: WaterReport[];
  complaints?: Complaint[];
  created_at: string;
  updated_at: string;
}

export interface SiteDetails {
  service_type: string | null;
  technician: string | null;
  dc_number: string | null;
  service_interval: string | null;
  last_serviced_date: string | null;
  notes: string | null;
}

export interface ServiceReport {
  id: string;
  report_code: string;
  date: string;
  technician: string;
  zone: string;
  remarks: string;
  client_name: string;
  status: "COMPLETED" | "AWAITING_CLIENT_SIGN";
}

export interface WaterReport {
  id: string;
  date: string;
  ph: string;
  tds: string;
  hardness: string;
}

export interface Complaint {
  id: string;
  date: string;
  issue: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  priority: "LOW" | "MEDIUM" | "HIGH";
}


export interface NewEnquiry {
  customer_name: string;
  contact_person: string;
  address: string;
  pincode: string;
  phone: string;
  remarks: string;
  followup_remarks: string;
  followup_next_date: string;
}

// ---- Followup --------------------------------------------------------------

export interface Followup {
  id: string;
  remarks: string;
  next_followup_date: string;
  entered_date: string;
}

export interface NewFollowup {
  remarks: string;
  next_followup_date: string;
}

// ---- Quotation -------------------------------------------------------------

export type QuoteType = "NORMAL" | "AMC" | "SPARES";
export type AmcType = "COMPREHENSIVE" | "NON_COMPREHENSIVE";


export interface QuotationItem {
  id: string;
  product_id: string | null;
  description: string;
  hsn: string;
  base_price: number;
  margin: number;
  gst_rate: number;
  quantity: number;
}

export interface AddressDetails {
  company_name: string;
  contact_person: string;
  phone: string;
  email: string;
  gst: string;
  pan: string;
  address: string;
  state: string;
}

export interface Quotation {
  id: string;
  title: string;
  quote_no: string;
  amount: number;
  date: string;
  type: QuoteType;
  amc_type?: AmcType | null;
  service_interval?: string | null;
  status: "DRAFT" | "QUOTE_SENT" | "CONFIRMED" | "REJECTED" | "EXPIRED";
  from_details: AddressDetails;
  to_details: AddressDetails;
  selected_bank_id: string;
  items: QuotationItem[];
  terms: string;
}

export interface NewQuotation {
  title: string;
  quote_no: string;
  type: QuoteType;
  amc_type?: AmcType | null;
  service_interval?: string | null;
  status: "DRAFT" | "QUOTE_SENT" | "CONFIRMED" | "REJECTED" | "EXPIRED";
  from_details: AddressDetails;
  to_details: AddressDetails;
  selected_bank_id: string;
  items: Omit<QuotationItem, "id">[];
  terms: string;
}

// ---- Bank Account ----------------------------------------------------------

export interface BankAccount {
  id: string;
  bank_name: string;
  account_no: string;
  ifsc_code: string;
}

// ---- Product Catalog (for quote builder presets) ----------------------------

export interface ProductPreset {
  id: string;
  type: QuoteType;
  description: string;
  hsn: string;
  base_price: number;
  margin: number;
  gst_rate: number;
}
