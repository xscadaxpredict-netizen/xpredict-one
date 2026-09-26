/**
 * Sales types.
 *
 * TEMPORARY. Once the backend runs, these are generated from its OpenAPI schema
 * into @xpredict/api-client and this file is deleted. Hand-written types drift
 * from the server, and the drift is invisible until runtime.
 *
 * Field names stay snake_case because that is what the API sends. Do not rename
 * them on the way in — a mapping layer is one more place for the contract to rot,
 * and it hides which field the backend actually rejected.
 */

export type EnquiryStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type EnquirySource = "walk_in" | "call" | "web";

export interface Enquiry {
  id: string;
  reference: string;
  status: EnquiryStatus;
  source: EnquirySource;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  /** Plain UUID: the User lives in the control database, so there is no nested object. */
  assigned_to_user_id: string | null;
  /** The dealership that owns this record. */
  unit_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface EnquiryFilters {
  status?: EnquiryStatus;
  search?: string;
  page?: number;
}

export interface NewEnquiry {
  source: EnquirySource;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  notes?: string;
}

export interface Paginated<T> {
  results: T[];
  count: number;
}
