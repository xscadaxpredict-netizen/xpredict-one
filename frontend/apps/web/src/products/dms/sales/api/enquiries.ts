/**
 * Sales API functions. No React in this file.
 *
 * TEMPORARY FAKE — same pattern as shell/admin/api/users.ts.
 * Delete the USE_FAKE block when the backend is running.
 */

import { ApiError } from "@xpredict/api-client";

import type {
  BankAccount,
  Enquiry,
  NewEnquiry,
  NewFollowup,
  NewQuotation,
  ProductPreset,
} from "./types";

/* ------------------------------------------------------------------------ *
 * TEMPORARY FAKE — delete this whole block when the backend is running.
 * ------------------------------------------------------------------------ */
const USE_FAKE = true;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function problem(status: number, code: string, detail: string): ApiError {
  return new ApiError({
    type: "about:blank",
    title: "Error",
    status,
    detail,
    code,
    trace_id: crypto.randomUUID(),
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

const FAKE_BANKS: BankAccount[] = [
  {
    id: "bank-1",
    bank_name: "HDFC Bank",
    account_no: "50200055554444",
    ifsc_code: "HDFC0001234",
  },
];

const FAKE_PRODUCTS: ProductPreset[] = [
  {
    id: "p1",
    type: "NORMAL",
    description: "RO Plant 1000 LPH Fully Automatic",
    hsn: "84212190",
    base_price: 120000,
    margin: 15,
    gst_rate: 18,
  },
  {
    id: "p2",
    type: "AMC",
    description: "Water Softener 2000 LPH Comprehensive AMC",
    hsn: "84212120",
    base_price: 45000,
    margin: 20,
    gst_rate: 18,
  },
  {
    id: "p3",
    type: "SPARES",
    description: "UV Purification System Spare Lamp",
    hsn: "84219900",
    base_price: 15000,
    margin: 10,
    gst_rate: 18,
  },
];

let FAKE_ENQUIRIES: Enquiry[] = [
  {
    id: uuid(),
    customer_name: "TechCorp Solutions",
    contact_person: "Sarah Jenkins",
    address: "123 Business Park, Silicon Valley, CA",
    pincode: "560090",
    phone: "+1 (555) 123-4567",
    remarks: "Looking for 5 new dealership licenses",
    status: "CONFIRMED",
    confirmed_quote_id: "q1",
    oc_number: "STP/OC/26-27/001",
    followups: [
      {
        id: uuid(),
        next_followup_date: "2026-09-28",
        entered_date: "2026-09-23",
        remarks: "Call back to finalize the quote and send contract.",
      },
      {
        id: uuid(),
        next_followup_date: "2026-09-25",
        entered_date: "2026-09-20",
        remarks: "Initial meeting went well. Needs a formal quote.",
      },
    ],
    quotes: [
      {
        id: "q1",
        title: "RO Plant Setup (Initial)",
        quote_no: "XAS/26-27/1001",
        amount: 162840,
        date: "2026-09-24",
        type: "NORMAL",
        status: "CONFIRMED",
        from_details: {
          company_name: "Xpredict Automation Solutions Pvt Ltd",
          contact_person: "",
          phone: "7795625583",
          email: "info@xpredictlabs.com",
          gst: "29AAACX2581L1ZU",
          pan: "AAACX2581L",
          address:
            "Thimlapura Road, Hurulichikanahalli, Bengaluru 560090",
          state: "Karnataka",
        },
        to_details: {
          company_name: "TechCorp Solutions",
          contact_person: "Sarah Jenkins",
          phone: "+1 (555) 123-4567",
          email: "",
          gst: "",
          pan: "",
          address: "123 Business Park, Silicon Valley, CA",
          state: "Karnataka",
        },
        selected_bank_id: "bank-1",
        items: [
          {
            id: uuid(),
            product_id: "p1",
            description: "RO Plant 1000 LPH Fully Automatic",
            hsn: "84212190",
            base_price: 120000,
            margin: 15,
            gst_rate: 18,
            quantity: 1,
          },
        ],
        terms:
          "1. Validity: 30 Days\n2. Payment: 100% Advance\n3. Delivery: 1-2 weeks from PO\n4. Warranty: 1 Year against manufacturing defects.",
      },
    ],
    service_reports: [
      {
        id: "sr-1",
        date: "2026-08-15",
        technician: "Ramesh",
        zone: "South",
        client_name: "TechCorp",
        report_code: "SR-1001",
        status: "COMPLETED",
        remarks: "Replaced 5-micron filters.",
      }
    ],
    water_reports: [
      {
        id: "wr-1",
        date: "2026-08-15",
        ph: "7.2",
        tds: "120",
        hardness: "50",
      }
    ],
    complaints: [
      {
        id: "c-1",
        date: "2026-09-20",
        issue: "Low pressure from RO pump",
        status: "RESOLVED",
        priority: "HIGH",
      }
    ],
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-24T14:30:00Z",
  },
  {
    id: uuid(),
    customer_name: "Global Industries",
    contact_person: "Mike Ross",
    address: "456 Industrial Way, New York, NY",
    pincode: "400001",
    phone: "+1 (555) 987-6543",
    remarks: "Interested in upgrading their current system",
    status: "PENDING",
    confirmed_quote_id: null,
    oc_number: null,
    followups: [
      {
        id: uuid(),
        next_followup_date: "2026-10-05",
        entered_date: "2026-09-24",
        remarks: "Schedule a demo for the new features.",
      },
    ],
    quotes: [],
    created_at: "2026-09-24T10:00:00Z",
    updated_at: "2026-09-24T10:00:00Z",
  },
];

// ---- API functions ---------------------------------------------------------

export async function fetchEnquiries(
  orgSlug: string,
): Promise<Enquiry[]> {
  void orgSlug;
  if (USE_FAKE) {
    await wait(400);
    return [...FAKE_ENQUIRIES];
  }
  throw new Error("Real API not implemented yet");
}

export async function createEnquiry(
  _orgSlug: string,
  body: NewEnquiry,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(500);
    const today = new Date().toISOString().split("T")[0];
    const enquiry: Enquiry = {
      id: uuid(),
      customer_name: body.customer_name,
      contact_person: body.contact_person,
      address: body.address,
      pincode: body.pincode,
      phone: body.phone,
      remarks: body.remarks,
      status: "PENDING",
      confirmed_quote_id: null,
      oc_number: null,
      followups: [
        {
          id: uuid(),
          remarks: body.followup_remarks,
          next_followup_date: body.followup_next_date,
          entered_date: today ?? "",
        },
      ],
      quotes: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    FAKE_ENQUIRIES = [enquiry, ...FAKE_ENQUIRIES];
    return enquiry;
  }
  throw new Error("Real API not implemented yet");
}

export async function addFollowup(
  _orgSlug: string,
  enquiryId: string,
  body: NewFollowup,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(300);
    const today = new Date().toISOString().split("T")[0];
    const enquiry = FAKE_ENQUIRIES.find((e) => e.id === enquiryId);
    if (!enquiry) throw problem(404, "not_found", "Enquiry not found.");

    const followup = {
      id: uuid(),
      remarks: body.remarks,
      next_followup_date: body.next_followup_date,
      entered_date: today ?? "",
    };
    enquiry.followups = [followup, ...enquiry.followups];
    return { ...enquiry };
  }
  throw new Error("Real API not implemented yet");
}

export async function saveQuotation(
  _orgSlug: string,
  enquiryId: string,
  body: NewQuotation,
  existingQuoteId?: string,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(600);
    const enquiry = FAKE_ENQUIRIES.find((e) => e.id === enquiryId);
    if (!enquiry) throw problem(404, "not_found", "Enquiry not found.");

    const taxable = body.items.reduce((sum, item) => {
      const unitPrice = item.base_price + item.base_price * (item.margin / 100);
      return sum + unitPrice * item.quantity;
    }, 0);
    const totalGst = body.items.reduce((sum, item) => {
      const unitPrice = item.base_price + item.base_price * (item.margin / 100);
      const itemTaxable = unitPrice * item.quantity;
      return sum + itemTaxable * (item.gst_rate / 100);
    }, 0);

    const quotation = {
      id: existingQuoteId ?? uuid(),
      title: body.title || "Untitled Quotation",
      quote_no: body.quote_no,
      amount: taxable + totalGst,
      date: new Date().toISOString().split("T")[0] ?? "",
      type: body.type,
      amc_type: body.amc_type,
      service_interval: body.service_interval,
      status: "DRAFT" as const,
      from_details: body.from_details,
      to_details: body.to_details,
      selected_bank_id: body.selected_bank_id,
      items: body.items.map((item) => ({ ...item, id: uuid() })),
      terms: body.terms,
    };

    if (existingQuoteId) {
      const idx = enquiry.quotes.findIndex((q) => q.id === existingQuoteId);
      if (idx >= 0) {
        enquiry.quotes[idx] = quotation;
      }
    } else {
      enquiry.quotes = [...enquiry.quotes, quotation];
    }
    return { ...enquiry };
  }
  throw new Error("Real API not implemented yet");
}

export async function confirmOrder(
  _orgSlug: string,
  enquiryId: string,
  quoteId: string,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(400);
    const enquiry = FAKE_ENQUIRIES.find((e) => e.id === enquiryId);
    if (!enquiry) throw problem(404, "not_found", "Enquiry not found.");
    if (enquiry.status === "CONFIRMED")
      throw problem(409, "already_confirmed", "This enquiry is already confirmed.");

    const ocNum = `STP/OC/26-27/${String(Math.floor(Math.random() * 900) + 100).padStart(3, "0")}`;
    enquiry.status = "CONFIRMED";
    enquiry.confirmed_quote_id = quoteId;
    enquiry.oc_number = ocNum;
    return { ...enquiry };
  }
  throw new Error("Real API not implemented yet");
}

export async function unconfirmOrder(
  _orgSlug: string,
  enquiryId: string,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(400);
    const enquiry = FAKE_ENQUIRIES.find((e) => e.id === enquiryId);
    if (!enquiry) throw problem(404, "not_found", "Enquiry not found.");

    enquiry.status = "PENDING";
    enquiry.confirmed_quote_id = null;
    enquiry.oc_number = null;
    return { ...enquiry };
  }
  throw new Error("Real API not implemented yet");
}

export async function deleteQuotation(
  _orgSlug: string,
  enquiryId: string,
  quoteId: string,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(300);
    const enquiry = FAKE_ENQUIRIES.find((e) => e.id === enquiryId);
    if (!enquiry) throw problem(404, "not_found", "Enquiry not found.");

    enquiry.quotes = enquiry.quotes.filter((q) => q.id !== quoteId);
    if (enquiry.confirmed_quote_id === quoteId) {
      enquiry.status = "PENDING";
      enquiry.confirmed_quote_id = null;
      enquiry.oc_number = null;
    }
    return { ...enquiry };
  }
  throw new Error("Real API not implemented yet");
}

export async function deleteEnquiry(_orgSlug: string, enquiryId: string): Promise<void> {
  if (USE_FAKE) {
    await wait(300);
    FAKE_ENQUIRIES = FAKE_ENQUIRIES.filter((e) => e.id !== enquiryId);
    return;
  }
  throw new Error("Real API not implemented yet");
}

export async function updateEnquiry(
  _orgSlug: string,
  enquiryId: string,
  body: Partial<NewEnquiry>,
): Promise<Enquiry> {
  if (USE_FAKE) {
    await wait(300);
    const enquiry = FAKE_ENQUIRIES.find((e) => e.id === enquiryId);
    if (!enquiry) throw problem(404, "not_found", "Enquiry not found.");
    
    if (body.customer_name) enquiry.customer_name = body.customer_name;
    if (body.contact_person) enquiry.contact_person = body.contact_person;
    if (body.address) enquiry.address = body.address;
    if (body.pincode) enquiry.pincode = body.pincode;
    if (body.phone) enquiry.phone = body.phone;
    if (body.remarks) enquiry.remarks = body.remarks;
    
    return { ...enquiry };
  }
  throw new Error("Real API not implemented yet");
}

export async function fetchBanks(
  orgSlug: string,
): Promise<BankAccount[]> {
  void orgSlug;
  if (USE_FAKE) {
    await wait(200);
    return [...FAKE_BANKS];
  }
  throw new Error("Real API not implemented yet");
}

export async function fetchProductPresets(
  orgSlug: string,
): Promise<ProductPreset[]> {
  void orgSlug;
  if (USE_FAKE) {
    await wait(200);
    return [...FAKE_PRODUCTS];
  }
  throw new Error("Real API not implemented yet");
}
