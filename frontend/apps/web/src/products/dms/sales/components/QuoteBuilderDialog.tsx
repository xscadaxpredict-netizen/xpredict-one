/**
 * Quote Builder Dialog.
 *
 * Full-screen dialog for creating or editing a quotation.
 */

import { useEffect, useRef, useState } from "react";
import type { QuotationItem, QuoteType, AmcType } from "../api/types";
import {
  useBanks,
  useDealerProfile,
  useProductPresets,
  useEnquiries,
  useSaveQuotation,
} from "../hooks/useEnquiries";
import { useDialog } from "../../shared/hooks/useDialog";
import { useShellContext } from "../../../../shell/context";
import styles from "./QuoteBuilderDialog.module.css";
import { fieldLabel, serverFieldErrors, validateQuote, type FieldErrors } from "./quoteValidation";
import { apiErrorMessage } from "../../shared/api/errorMessage";

interface QuoteBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  enquiryId?: string; // Optional: If missing, show enquiry selector
  existingQuoteId?: string; // If provided, we are editing.
  /**
   * The quote types this screen may create; the first is preselected. The AMC
   * page passes ["AMC"] and Sales pages pass ["NORMAL"], so the type is fixed there;
   * only the Quotations page offers all three. Editing keeps the saved type.
   */
  allowedTypes?: readonly QuoteType[];
}

const ALL_QUOTE_TYPES: readonly QuoteType[] = ["NORMAL", "AMC", "SPARES"];

const QUOTE_TYPE_LABELS: Record<QuoteType, string> = {
  NORMAL: "Machine Quote",
  AMC: "AMC Quote",
  SPARES: "Spares Quote",
};

const EMPTY_ITEM: QuotationItem = {
  id: "",
  product_id: null,
  description: "",
  hsn: "",
  base_price: 0,
  margin: 0,
  gst_rate: 18,
  quantity: 1,
};

export function QuoteBuilderDialog({
  open,
  onClose,
  enquiryId,
  existingQuoteId,
  allowedTypes = ALL_QUOTE_TYPES,
}: QuoteBuilderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: enquiries } = useEnquiries();
  const { data: banks, isLoading: banksLoading } = useBanks();
  const { data: products } = useProductPresets();
  const { data: dealerProfile, isLoading: profileLoading } = useDealerProfile();
  const saveQuote = useSaveQuotation();
  const { DialogComponent } = useDialog();
  const { membership } = useShellContext();

  const [selectedEnquiryId, setSelectedEnquiryId] = useState(enquiryId || "");
  const currentEnquiry = enquiries?.find((e) => e.id === selectedEnquiryId);
  const existingQuote = currentEnquiry?.quotes.find((q) => q.id === existingQuoteId);

  // ---- Form State ----
  // A string, not the array: callers may pass a fresh array literal each render,
  // and the form-reset effect below must not re-run (and wipe input) because of it.
  const defaultType: QuoteType = allowedTypes[0] ?? "NORMAL";
  const [quoteType, setQuoteType] = useState<QuoteType>(defaultType);
  // Agent / channel-partner commission is for machine quotes only --- never AMC
  // or spares. The backend enforces the same rule on save.
  const commissionApplies = quoteType === "NORMAL";
  // An old quote being edited keeps its type even if this screen would not offer it.
  const typeOptions: readonly QuoteType[] =
    existingQuote && !allowedTypes.includes(existingQuote.type)
      ? [existingQuote.type, ...allowedTypes]
      : allowedTypes;
  const [amcType, setAmcType] = useState<AmcType>("COMPREHENSIVE");
  const [serviceInterval, setServiceInterval] = useState("3 Months");
  
  const [title, setTitle] = useState("");
  const [quoteNo, setQuoteNo] = useState("");
  
  // From Details
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromPhone, setFromPhone] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromGst, setFromGst] = useState("");
  const [fromPan, setFromPan] = useState("");
  const [fromState, setFromState] = useState("");
  
  // To Details
  const [toName, setToName] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [toContactPerson, setToContactPerson] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [toGst, setToGst] = useState("");
  const [toPan, setToPan] = useState("");
  const [toState, setToState] = useState("");
  
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [bankId, setBankId] = useState("");
  const [terms, setTerms] = useState("");

  // Agent Commission State
  const [hasAgentCommission, setHasAgentCommission] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [commissionType, setCommissionType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [commissionRate, setCommissionRate] = useState<number>(0);

  // The VALUE is never read -- `submitStatusRef` below is what the submit
  // handler reads, because a state update is not visible to the handler that
  // triggered it. Only the setter is kept, so the state still drives renders.
  const [, setSubmitStatus] = useState<"DRAFT" | "QUOTE_SENT">("QUOTE_SENT");
  const submitStatusRef = useRef<"DRAFT" | "QUOTE_SENT">("QUOTE_SENT");

  // ---- Initialise the form ONCE per opening -------------------------------
  // It used to re-run whenever the bank list, the profile or the enquiries
  // reloaded, overwriting what had been typed; and a second effect refilled
  // the company name the moment it was cleared. Now: wait until the data is
  // there, fill the form once, and leave it to the person after that.
  const initialisedRef = useRef(false);

  /**
   * Details for a NEW quote on this enquiry. Whatever was entered on its most
   * recent quote is reused -- the machine quote's details carry into the AMC
   * quote and the next revision -- so nobody types them twice. The customer
   * name always comes from the enquiry itself.
   */
  const fillNewQuoteDetails = (enquiry: typeof currentEnquiry) => {
    const latest = [...(enquiry?.quotes ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const from = latest?.from_details;
    const to = latest?.to_details;

    setTitle("Quotation for " + (enquiry?.customer_name || ""));
    setFromName(from?.company_name || dealerProfile?.company_name || membership?.unit_name || membership?.org_name || "");
    setFromAddress(from?.address || dealerProfile?.address || "");
    setFromPhone(from?.phone || dealerProfile?.phone || "");
    setFromEmail(from?.email || dealerProfile?.email || "");
    setFromGst(from?.gst || dealerProfile?.gstin || "");
    setFromPan(from?.pan || dealerProfile?.pan || "");
    setFromState(from?.state || dealerProfile?.state || "");

    setToName(enquiry?.customer_name || "");
    setToAddress(to?.address || enquiry?.address || "");
    setToContactPerson(to?.contact_person || enquiry?.contact_person || "");
    setToPhone(to?.phone || enquiry?.phone || "");
    setToEmail(to?.email || "");
    setToGst(to?.gst || "");
    setToPan(to?.pan || "");
    setToState(to?.state || "");

    setHasAgentCommission(Boolean(enquiry?.agent_name));
    setAgentName(enquiry?.agent_name || "");
  };

  useEffect(() => {
    if (!open) {
      initialisedRef.current = false;
      return;
    }
    if (initialisedRef.current) return;

    if (existingQuoteId) {
      if (!existingQuote) return; // still loading
        setQuoteType(existingQuote.type);
      if (existingQuote.amc_type) setAmcType(existingQuote.amc_type);
      if (existingQuote.service_interval) setServiceInterval(existingQuote.service_interval);
      
      setTitle(existingQuote.title);
      setQuoteNo(existingQuote.quote_no);
      setFromName(existingQuote.from_details?.company_name || "");
      setFromAddress(existingQuote.from_details?.address || "");
      setFromPhone(existingQuote.from_details?.phone || "");
      setFromEmail(existingQuote.from_details?.email || "");
      setFromGst(existingQuote.from_details?.gst || "");
      setFromPan(existingQuote.from_details?.pan || "");
      setFromState(existingQuote.from_details?.state || "");

      setToName(existingQuote.to_details?.company_name || "");
      setToAddress(existingQuote.to_details?.address || "");
      setToContactPerson(existingQuote.to_details?.contact_person || "");
      setToPhone(existingQuote.to_details?.phone || "");
      setToEmail(existingQuote.to_details?.email || "");
      setToGst(existingQuote.to_details?.gst || "");
      setToPan(existingQuote.to_details?.pan || "");
      setToState(existingQuote.to_details?.state || "");

      setItems(existingQuote.items.map(i => ({ ...i })));
      setBankId(existingQuote.selected_bank_id);
      setTerms(existingQuote.terms);
      setHasAgentCommission(Boolean(existingQuote.agent_name || (existingQuote.commission_amount && existingQuote.commission_amount > 0)));
      setAgentName(existingQuote.agent_name || "");
      setCommissionType(existingQuote.commission_type || "PERCENTAGE");
      // One input serves both types: a percentage, or the rupee amount itself.
      setCommissionRate(
        existingQuote.commission_type === "FIXED"
          ? Number(existingQuote.commission_amount) || 0
          : Number(existingQuote.commission_rate) || 0,
      );
      initialisedRef.current = true;
      return;
    }

    // A new quote: wait for the profile, the banks and the enquiry.
    if (profileLoading || banksLoading) return;
    if (selectedEnquiryId && !currentEnquiry) return;

    setQuoteType(defaultType);
    setQuoteNo(`QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`);
    fillNewQuoteDetails(currentEnquiry);
    setItems([{ ...EMPTY_ITEM, id: window.crypto.randomUUID() }]);
    const defaultBank = banks?.find((b) => b.is_default) || banks?.[0];
    setBankId(defaultBank?.id || "");
    setTerms("1. 100% Advance Payment\n2. Validity: 30 days");
    setCommissionType("PERCENTAGE");
    setCommissionRate(0);
    initialisedRef.current = true;
  }, [open, existingQuoteId, existingQuote, currentEnquiry, selectedEnquiryId, banks, banksLoading, dealerProfile, profileLoading, defaultType]);

  // Picking a different enquiry in the selector (Quotations page) fills in
  // that enquiry's details -- the one deliberate refill.
  const lastEnquiryRef = useRef(selectedEnquiryId);
  useEffect(() => {
    if (!open || existingQuoteId || !initialisedRef.current) return;
    if (lastEnquiryRef.current === selectedEnquiryId || !currentEnquiry) return;
    lastEnquiryRef.current = selectedEnquiryId;
    fillNewQuoteDetails(currentEnquiry);
  }, [open, existingQuoteId, selectedEnquiryId, currentEnquiry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // ---- Calculations ----
  const taxableTotal = items.reduce((sum, item) => sum + item.quantity * item.base_price * (1 + item.margin / 100), 0);
  const taxTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.base_price * (1 + item.margin / 100) * (item.gst_rate / 100),
    0,
  );
  const grandTotal = taxableTotal + taxTotal;
  const commissionAmount = commissionType === "PERCENTAGE"
    ? Math.round((taxableTotal * (commissionRate || 0)) / 100)
    : (commissionRate || 0);
  const activeCommission = commissionApplies && hasAgentCommission ? commissionAmount : 0;
  
  // What we get Before Tax (Base Revenue minus Agent Cut)
  const ourNetBeforeTax = Math.max(0, taxableTotal - activeCommission);
  const ourNetBeforeTaxPercentage = taxableTotal > 0 ? ((ourNetBeforeTax / taxableTotal) * 100).toFixed(1) : "0";
  
  // Total Cash Customer Pays minus Agent Payout (Cash in Bank before GST remittance)
  const ourCashInflowAfterCommission = Math.max(0, grandTotal - activeCommission);

  // ---- Handlers ----
  const handleAddItem = () => {
    setItems([...items, { ...EMPTY_ITEM, id: window.crypto.randomUUID() }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof QuotationItem, value: string | number | null) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const applyPreset = (presetId: string, index: number) => {
    const preset = products?.find((p) => p.id === presetId);
    if (!preset) return;
    const newItems = [...items];
    const targetItem = newItems[index];
    if (!targetItem) return;
    
    newItems[index] = {
      ...targetItem,
      product_id: preset.id,
      description: preset.description,
      hsn: preset.hsn,
      base_price: preset.base_price,
      margin: preset.margin,
      gst_rate: preset.gst_rate,
    };
    setItems(newItems);
  };

  // ---- Validation: what is missing or wrong, shown on the field itself -----
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const draft = () => ({
    enquiryId: selectedEnquiryId || "",
    title, quoteNo, isAmc: quoteType === "AMC", serviceInterval: serviceInterval || "",
    fromName, fromAddress, fromPhone, fromEmail,
    toName, toAddress, toPhone, toEmail,
    bankId: bankId || "", bankCount: banks?.length ?? 0,
    commission: commissionApplies && hasAgentCommission && agentName.trim() !== ""
      ? { type: commissionType, value: commissionRate || 0 }
      : null,
    items: items.map((it) => ({ description: it.description, quantity: it.quantity, base_price: it.base_price })),
  });
  // Re-checked on every render once a save was tried, so a fixed field clears at once.
  const fieldErrors: FieldErrors = attempted ? { ...serverErrors, ...validateQuote(draft()) } : serverErrors;
  const inv = (key: string) => ({ "aria-invalid": fieldErrors[key] ? true : undefined, "data-field": key });
  const msg = (key: string) =>
    fieldErrors[key] ? <span className={styles.fieldError}>{fieldErrors[key]}</span> : null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setServerErrors({});
    const problems = validateQuote(draft());
    if (Object.keys(problems).length > 0) {
      errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    
    const sendCommission = commissionApplies && hasAgentCommission && agentName.trim() !== "";

    saveQuote.mutate(
      {
        enquiryId: selectedEnquiryId,
        existingQuoteId,
        body: {
          title,
          quote_no: quoteNo,
          type: quoteType,
          amc_type: quoteType === "AMC" ? amcType : undefined,
          service_interval: quoteType === "AMC" ? serviceInterval : "",
          status: existingQuote?.status === "DRAFT" ? submitStatusRef.current : (existingQuote?.status || submitStatusRef.current),
          from_details: { 
            company_name: fromName, 
            address: fromAddress,
            phone: fromPhone,
            email: fromEmail,
            gst: fromGst,
            pan: fromPan,
            state: fromState,
          },
          to_details: { 
            company_name: toName, 
            address: toAddress,
            contact_person: toContactPerson,
            phone: toPhone,
            email: toEmail,
            gst: toGst,
            pan: toPan,
            state: toState,
          },
          items,
          selected_bank_id: bankId,
          terms,
          agent_name: sendCommission ? agentName.trim() : undefined,
          commission_type: sendCommission ? commissionType : undefined,
          // The rate is a PERCENTAGE (at most 999.99 on the server). A fixed
          // commission is sent as the amount only -- sending the rupees as the
          // rate is what refused every fixed commission over ₹999.
          commission_rate: sendCommission ? (commissionType === "PERCENTAGE" ? commissionRate || 0 : 0) : undefined,
          commission_amount: sendCommission ? commissionAmount : undefined,
        },
      },
      {
        onSuccess: () => {
          setAttempted(false);
          setServerErrors({});
          onClose();
        },
        onError: (err: unknown) => {
          setServerErrors(serverFieldErrors(err) ?? { form: apiErrorMessage(err, "The quote could not be saved.") });
          errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      },
    );
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{existingQuote ? "Edit Quote" : "New Quote"}</h2>
          <p className={styles.subtitle}>{currentEnquiry?.customer_name || "Select an enquiry"}</p>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <form onSubmit={handleSave} className={styles.formContent} noValidate>
        <div className={styles.body}>
          <div ref={errorSummaryRef}>
            {Object.keys(fieldErrors).length > 0 && (
              <div className={styles.errorSummary} role="alert">
                <strong>Please fix {Object.keys(fieldErrors).length === 1 ? "this" : `these ${Object.keys(fieldErrors).length}`} before saving:</strong>
                <ul>
                  {Object.entries(fieldErrors).map(([key, text]) => (
                    <li key={key}>{key === "form" ? text : `${fieldLabel(key)}: ${text}`}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {/* Top Section */}
          <div className={styles.grid2}>
            {/* If no enquiryId is passed via props, allow selection */}
            {!enquiryId && !existingQuote && (
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <label className={styles.label}>
                                  Select Enquiry <span style={{ color: "red" }}>*</span>
                              </label>
                <select
                  required
                  className={styles.select}
                  {...inv("enquiry")}
                  value={selectedEnquiryId}
                  onChange={(e) => setSelectedEnquiryId(e.target.value)}
                >
                  <option value="" disabled>Select an enquiry...</option>
                  {enquiries?.map((enq) => (
                    <option key={enq.id} value={enq.id}>
                      {enq.customer_name} ({enq.contact_person})
                    </option>
                  ))}
                </select>
                {msg("enquiry")}
              </div>
            )}
            
            <div className={styles.field}>
              <label className={styles.label}>Quote Type</label>
              <select
                className={styles.select}
                value={quoteType}
                onChange={(e) => setQuoteType(e.target.value as QuoteType)}
                disabled={!!existingQuote || typeOptions.length === 1}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{QUOTE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                              Quote Number <span style={{ color: "red" }}>*</span>
                          </label>
              <input
                required
                className={styles.input}
                {...inv("quote_no")}
                value={quoteNo}
                onChange={(e) => setQuoteNo(e.target.value)}
              />
              {msg("quote_no")}
            </div>
            
            {/* AMC Specific Fields */}
            {quoteType === "AMC" && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>AMC Type</label>
                  <select
                    className={styles.select}
                    value={amcType}
                    onChange={(e) => setAmcType(e.target.value as AmcType)}
                  >
                    <option value="COMPREHENSIVE">Comprehensive</option>
                    <option value="NON_COMPREHENSIVE">Non-Comprehensive</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>
                                      Service Interval <span style={{ color: "red" }}>*</span>
                                  </label>
                  <input
                    required
                    className={styles.input}
                    {...inv("service_interval")}
                    value={serviceInterval}
                    onChange={(e) => setServiceInterval(e.target.value)}
                    placeholder="e.g. 3 Months"
                  />
                  {msg("service_interval")}
                </div>
              </>
            )}
            
            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.label}>
                              Quote Title <span style={{ color: "red" }}>*</span>
                          </label>
              <input
                required
                className={styles.input}
                {...inv("title")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {msg("title")}
            </div>
          </div>

          <div className={styles.grid2}>
            {/* From Details */}
            <div className={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 className={styles.cardTitle}>From (Our Details)</h3>
                <span style={{ fontSize: "0.72rem", color: "var(--color-text-3, #64748b)" }}>From Dealership Profile</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Company Name <span style={{ color: "red" }}>*</span>
                </label>
                <input {...inv("from_details.company_name")} required className={styles.input} value={fromName} onChange={(e) => setFromName(e.target.value)} />
                {msg("from_details.company_name")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Phone Number</label>
                  <input {...inv("from_details.phone")} className={styles.input} value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} placeholder="e.g. 9876543210" />
                  {msg("from_details.phone")}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Email Address</label>
                  <input {...inv("from_details.email")} type="email" className={styles.input} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="e.g. info@company.com" />
                  {msg("from_details.email")}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>State</label>
                <input className={styles.input} value={fromState} onChange={(e) => setFromState(e.target.value)} placeholder="e.g. Karnataka" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Address <span style={{ color: "red" }}>*</span>
                </label>
                <textarea {...inv("from_details.address")} required className={styles.textarea} value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} style={{ minHeight: "50px" }} />
                {msg("from_details.address")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Our GSTIN</label>
                  <input className={styles.input} value={fromGst} onChange={(e) => setFromGst(e.target.value)} placeholder="29AAAAA0000A1Z5" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Our PAN</label>
                  <input className={styles.input} value={fromPan} onChange={(e) => setFromPan(e.target.value)} placeholder="AAAAA0000A" />
                </div>
              </div>
            </div>

            {/* To Details */}
            <div className={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 className={styles.cardTitle}>To (Customer)</h3>
                <span style={{ fontSize: "0.72rem", color: "var(--color-text-3, #64748b)" }}>Name from the enquiry · other details editable</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Customer Name <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  {...inv("to_details.company_name")}
                  required
                  readOnly
                  className={styles.input}
                  value={toName}
                  title="Comes from the enquiry. Change the customer on the enquiry itself."
                  style={{ background: "var(--color-surface-alt, #f1f5f9)", cursor: "not-allowed" }}
                />
                {msg("to_details.company_name")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Contact Person</label>
                  <input className={styles.input} value={toContactPerson} onChange={(e) => setToContactPerson(e.target.value)} placeholder="e.g. Ramesh" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Phone Number</label>
                  <input {...inv("to_details.phone")} className={styles.input} value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="e.g. 9876543210" />
                  {msg("to_details.phone")}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Email Address</label>
                  <input {...inv("to_details.email")} type="email" className={styles.input} value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="e.g. client@domain.com" />
                  {msg("to_details.email")}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>State / Place of Supply</label>
                  <input className={styles.input} value={toState} onChange={(e) => setToState(e.target.value)} placeholder="e.g. Karnataka" />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Billing Address <span style={{ color: "red" }}>*</span>
                </label>
                <textarea {...inv("to_details.address")} required className={styles.textarea} value={toAddress} onChange={(e) => setToAddress(e.target.value)} style={{ minHeight: "50px" }} />
                {msg("to_details.address")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Customer GSTIN <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 400 }}>(Optional for B2B)</span>
                  </label>
                  <input className={styles.input} value={toGst} onChange={(e) => setToGst(e.target.value.toUpperCase())} placeholder="e.g. 29ABCDE1234F1Z5" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Customer PAN <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <input className={styles.input} value={toPan} onChange={(e) => setToPan(e.target.value.toUpperCase())} placeholder="e.g. ABCDE1234F" />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Line Items</h3>
              <button type="button" className={styles.btnSecondary} onClick={handleAddItem}>
                + Add Item
              </button>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Product / Description</th>
                    <th style={{ width: "80px" }}>Qty</th>
                    <th style={{ width: "120px" }}>Base (₹)</th>
                    <th style={{ width: "80px" }}>Margin %</th>
                    <th style={{ width: "80px" }}>Tax %</th>
                    <th style={{ width: "120px", textAlign: "right" }}>Total</th>
                    <th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
                          <select
                            className={styles.select}
                            onChange={(e) => applyPreset(e.target.value, index)}
                            defaultValue=""
                          >
                            <option value="" disabled>Select a preset...</option>
                            {products?.filter(p => p.type === quoteType).map((p) => {
                              const isOem = p.is_global || !p.unit_id;
                              const tag = isOem ? "[OEM]" : "[Dealer]";
                              return (
                                <option key={p.id} value={p.id}>
                                  {tag} {p.name || p.description}
                                </option>
                              );
                            })}
                          </select>
                          <input
                            required
                            className={styles.input}
                            {...inv(`items.${index}.description`)}
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                            placeholder="Custom description..."
                          />
                          {msg(`items.${index}.description`)}
                        </div>
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="1"
                          className={styles.input}
                          {...inv(`items.${index}.quantity`)}
                          value={item.quantity === 0 ? "" : item.quantity}
                          placeholder="1"
                          onChange={(e) => handleItemChange(item.id, "quantity", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        />
                        {msg(`items.${index}.quantity`)}
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          className={styles.input}
                          {...inv(`items.${index}.base_price`)}
                          value={item.base_price === 0 ? "" : item.base_price}
                          placeholder="0"
                          onChange={(e) => handleItemChange(item.id, "base_price", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                        />
                        {msg(`items.${index}.base_price`)}
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          className={styles.input}
                          value={item.margin === 0 ? "" : item.margin}
                          placeholder="0"
                          onChange={(e) => handleItemChange(item.id, "margin", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          max="100"
                          className={styles.input}
                          value={item.gst_rate === 0 ? "" : item.gst_rate}
                          placeholder="0"
                          onChange={(e) => handleItemChange(item.id, "gst_rate", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {((item.quantity * item.base_price * (1 + item.margin / 100)) * (1 + item.gst_rate / 100)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.btnIconDanger}
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={items.length === 1}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span>Subtotal (Taxable Base):</span>
                <span>₹ {taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Total Tax (GST):</span>
                <span>₹ {taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Grand Total (Customer Pays):</span>
                <span>₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              {commissionApplies && hasAgentCommission && commissionAmount > 0 && (
                <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "2px dashed var(--color-border, #cbd5e1)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-3, #64748b)" }}>
                    Our Realization (Internal Breakdown)
                  </div>
                  <div className={styles.totalRow} style={{ color: "#b45309", fontSize: "0.82rem" }}>
                    <span>− Agent Commission:</span>
                    <span>− ₹ {commissionAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className={styles.totalRow} style={{ color: "#047857", fontWeight: 700, fontSize: "0.88rem" }}>
                    <span>✓ What We Get (Before Tax):</span>
                    <span>₹ {ourNetBeforeTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({ourNetBeforeTaxPercentage}%)</span>
                  </div>
                  <div className={styles.totalRow} style={{ color: "#1e40af", fontWeight: 600, fontSize: "0.85rem" }}>
                    <span>✓ Net Cash from Customer:</span>
                    <span>₹ {ourCashInflowAfterCommission.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-3, #64748b)", fontStyle: "italic", textAlign: "right", marginTop: "2px" }}>
                    (Includes ₹{taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} GST payable to Govt)
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.grid2}>
            {/* Bank Details */}
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Bank Details</h3>
              <div className={styles.field}>
                <label className={styles.label}>
                                  Select Bank Account <span style={{ color: "red" }}>*</span>
                              </label>
                <select
                  required
                  className={styles.select}
                  {...inv("selected_bank_id")}
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  <option value="" disabled>Select a bank...</option>
                  {banks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} - {b.account_no} {b.is_default ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
                {msg("selected_bank_id")}
                {banks && banks.length === 0 && (
                  <p style={{ fontSize: "0.8rem", color: "var(--color-warning-text, #d97706)", marginTop: "4px" }}>
                    No bank account found. Please add a bank account under Configuration &gt; Bank Accounts.
                  </p>
                )}
              </div>
            </div>

            {/* Terms */}
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Terms & Conditions</h3>
              <textarea
                required
                className={styles.textarea}
                rows={4}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
          </div>

          {/* Agent Commission (Internal Only) --- machine quotes only */}
          {commissionApplies && (
          <div className={styles.card} style={{ marginTop: "var(--space-4)", background: "var(--color-surface-subtle, #f8fafc)", border: "1px dashed var(--color-border, #cbd5e1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  style={{ width: "18px", height: "18px", accentColor: "var(--color-primary, #0f172a)", cursor: "pointer" }}
                  checked={hasAgentCommission}
                  onChange={(e) => setHasAgentCommission(e.target.checked)}
                />
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--color-text, #0f172a)" }}>
                  Involve Agent / Channel Partner Commission
                </span>
              </label>
              {hasAgentCommission && (
                <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "9999px", background: "#fef3c7", color: "#92400e", fontWeight: 600 }}>
                  Internal Only (Not on Quote PDF)
                </span>
              )}
            </div>

            {hasAgentCommission && (
              <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px dashed var(--color-border, #e2e8f0)" }}>
                <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted, #64748b)", marginBottom: "var(--space-3)" }}>
                  Record agent / channel partner success commission. This remains confidential to your organization and is never shared with the customer.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-3)", alignItems: "end" }}>
                  <div className={styles.field}>
                    <label className={styles.label}>Agent / Referrer Name</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g. Rajesh Kumar"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Commission Type</label>
                    <select
                      className={styles.select}
                      value={commissionType}
                      onChange={(e) => setCommissionType(e.target.value as "PERCENTAGE" | "FIXED")}
                    >
                      <option value="PERCENTAGE">Percentage (%) of Base</option>
                      <option value="FIXED">Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>
                      {commissionType === "PERCENTAGE" ? "Commission Rate (%)" : "Commission Amount (₹)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step={commissionType === "PERCENTAGE" ? "0.1" : "500"}
                      className={styles.input}
                      value={commissionRate || ""}
                      placeholder="0"
                      onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
                      {...inv("commission_rate")}
                    />
                    {msg("commission_rate")}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Agent Cut (Commission)</label>
                    <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", fontWeight: 700, color: "#b45309", height: "38px", display: "flex", alignItems: "center" }}>
                      − ₹ {commissionAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* After the agent's cut: what we keep, before and after GST */}
                <div style={{ marginTop: "var(--space-3)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
                  <div style={{ padding: "14px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#047857", fontWeight: 700 }}>After Agent Cut — Before Tax</span>
                    <strong style={{ fontSize: "1.2rem", color: "#047857" }}>₹ {ourNetBeforeTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <span style={{ fontSize: "0.75rem", color: "#065f46" }}>
                      ₹ {taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} − ₹ {activeCommission.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ padding: "14px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#1e40af", fontWeight: 700 }}>After Agent Cut — After Tax (incl. GST)</span>
                    <strong style={{ fontSize: "1.2rem", color: "#1e40af" }}>₹ {ourCashInflowAfterCommission.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-3, #64748b)" }}>
                      ₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} − ₹ {activeCommission.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saveQuote.isPending}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            {(!existingQuote || existingQuote.status === "DRAFT") && (
              <button 
                type="submit" 
                className={styles.btnSecondary} 
                onClick={() => { submitStatusRef.current = "DRAFT"; setSubmitStatus("DRAFT"); }}
                disabled={saveQuote.isPending}
              >
                Save as Draft
              </button>
            )}
            <button 
              type="submit" 
              className={styles.btnPrimary} 
              onClick={() => { submitStatusRef.current = "QUOTE_SENT"; setSubmitStatus("QUOTE_SENT"); }}
              disabled={saveQuote.isPending}
            >
              {saveQuote.isPending ? "Saving..." : "Save & Finalize"}
            </button>
          </div>
        </div>
      </form>
      <DialogComponent />
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
