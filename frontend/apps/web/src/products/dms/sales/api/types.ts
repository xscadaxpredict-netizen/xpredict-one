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
  source?: string;
  status: EnquiryStatus;
  confirmed_quote_id: string | null;
  oc_number: string | null;
  agent_id?: string | null;
  agent_name?: string;
  lead_fee?: number;
  lead_fee_status?: "NONE" | "DUE" | "PAID";
  lead_fee_payment_ref?: string;
  lead_fee_paid_at?: string | null;
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
  agent_id?: string | null;
  agent_name?: string;
  lead_fee?: number;
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
  contact_person?: string;
  phone?: string;
  email?: string;
  gst?: string;
  pan?: string;
  address: string;
  state?: string;
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
  agent_id?: string | null;
  agent_name?: string;
  commission_type?: "PERCENTAGE" | "FIXED";
  commission_rate?: number;
  commission_amount?: number;
  commission_status?: "NONE" | "PENDING" | "PAYABLE" | "PARTIALLY_PAID" | "PAID";
  commission_payment_ref?: string;
  commission_paid_at?: string | null;
  paid_amount?: number;
  balance_amount?: number;
  payouts?: AgentPayoutItem[];
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
  agent_id?: string | null;
  agent_name?: string;
  commission_type?: "PERCENTAGE" | "FIXED";
  commission_rate?: number;
  commission_amount?: number;
}

export interface AgentPayoutAttachment {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number;
}

export interface AgentPayoutItem {
  id: string;
  amount: number;
  payment_ref: string;
  paid_at: string | null;
  notes?: string;
  attachments: AgentPayoutAttachment[];
}

export interface AgentCommissionRecord {
  type: "COMMISSION" | "LEAD_FEE";
  id: string;
  reference_id: string;
  enquiry_id: string;
  deal_title: string;
  quote_no: string;
  customer_name: string;
  agent_id: string | null;
  agent_name: string;
  amount: number;
  paid_amount?: number;
  balance_amount?: number;
  rate: number;
  commission_type: "PERCENTAGE" | "FIXED";
  status: string;
  payment_ref: string;
  paid_at: string | null;
  created_at: string | null;
  payouts?: AgentPayoutItem[];
}

// ---- Bank Account ----------------------------------------------------------

export interface BankAccount {
  id: string;
  unit_id?: string | null;
  is_org_bank?: boolean;
  ownership?: "ORGANIZATION" | "DEALER";
  bank_name: string;
  account_no: string;
  ifsc_code: string;
  branch_name?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export type NewBankAccount = Omit<BankAccount, "id">;

// ---- Product Catalog (for quote builder presets) ----------------------------

export interface ProductPreset {
  id: string;
  unit_id?: string | null;
  is_global?: boolean;
  ownership?: "OEM" | "DEALER";
  type: QuoteType;
  name?: string;
  description: string;
  hsn: string;
  base_price: number;
  margin: number;
  gst_rate: number;
  category?: string;
  specs?: string[];
  image?: string;
}

export type NewProductPreset = Omit<ProductPreset, "id">;
