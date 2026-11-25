import { describe, expect, it } from "vitest";
import { fieldLabel, validateQuote, type QuoteDraft } from "./quoteValidation";

const OK: QuoteDraft = {
  enquiryId: "e1", title: "Quotation", quoteNo: "QT-1", isAmc: false, serviceInterval: "",
  fromName: "Sirish Motors", fromAddress: "Bengaluru", fromPhone: "234567890", fromEmail: "dsf@gmail.com",
  toName: "Dell technologies", toAddress: "Neelasandra", toPhone: "6363902388", toEmail: "",
  bankId: "b1", bankCount: 1, items: [{ description: "Machine", quantity: 1, base_price: 700000 }],
};

describe("validateQuote", () => {
  it("passes a complete quote", () => {
    expect(validateQuote(OK)).toEqual({});
  });

  it("explains a missing bank when none exists yet", () => {
    const e = validateQuote({ ...OK, bankId: "", bankCount: 0 });
    expect(e.selected_bank_id).toMatch(/DMS settings → Masters → Bank Accounts/);
  });

  it("flags a malformed email but not an empty one", () => {
    expect(validateQuote({ ...OK, fromEmail: "dsf@gmail" })["from_details.email"]).toBeDefined();
    expect(validateQuote({ ...OK, toEmail: "" })["to_details.email"]).toBeUndefined();
  });

  it("names the line that is wrong", () => {
    const e = validateQuote({ ...OK, items: [OK.items[0]!, { description: " ", quantity: 0, base_price: 5 }] });
    expect(e["items.1.description"]).toMatch(/Line 2/);
    expect(e["items.1.quantity"]).toMatch(/Line 2/);
  });

  it("requires the mandatory fields", () => {
    const e = validateQuote({ ...OK, title: "", fromAddress: "", toName: "" });
    expect(Object.keys(e).sort()).toEqual(["from_details.address", "title", "to_details.company_name"]);
  });
});

describe("agent commission", () => {
  it("accepts a fixed amount in rupees, however large", () => {
    expect(validateQuote({ ...OK, commission: { type: "FIXED", value: 25000 } })).toEqual({});
  });

  it("accepts an ordinary percentage, including 3.33", () => {
    expect(validateQuote({ ...OK, commission: { type: "PERCENTAGE", value: 3.33 } })).toEqual({});
  });

  it("refuses a percentage over 100 or with three decimals", () => {
    expect(validateQuote({ ...OK, commission: { type: "PERCENTAGE", value: 150 } }).commission_rate).toMatch(/0 and 100/);
    expect(validateQuote({ ...OK, commission: { type: "PERCENTAGE", value: 2.125 } }).commission_rate).toMatch(/2 decimal/);
  });
});

describe("fieldLabel", () => {
  it("turns server paths into words", () => {
    expect(fieldLabel("from_details.email")).toBe("From (our details) – Email address");
    expect(fieldLabel("items.0.margin")).toBe("Line 1 – Margin");
    expect(fieldLabel("selected_bank_id")).toBe("Bank account");
  });
});
