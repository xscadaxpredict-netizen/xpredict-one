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

interface QuoteBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  enquiryId?: string; // Optional: If missing, show enquiry selector
  existingQuoteId?: string; // If provided, we are editing.
}

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
}: QuoteBuilderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: enquiries } = useEnquiries();
  const { data: banks } = useBanks();
  const { data: products } = useProductPresets();
  const { data: dealerProfile } = useDealerProfile();
  const saveQuote = useSaveQuotation();
  const { showAlert, DialogComponent } = useDialog();
  const { membership } = useShellContext();

  const [selectedEnquiryId, setSelectedEnquiryId] = useState(enquiryId || "");
  const currentEnquiry = enquiries?.find((e) => e.id === selectedEnquiryId);
  const existingQuote = currentEnquiry?.quotes.find((q) => q.id === existingQuoteId);

  // ---- Form State ----
  const [quoteType, setQuoteType] = useState<QuoteType>("NORMAL");
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

  // Initialize form
  useEffect(() => {
    if (open) {
      if (existingQuote) {
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
        setCommissionRate(existingQuote.commission_rate ? Number(existingQuote.commission_rate) : 0);
      } else {
        // Defaults for new quote
        setTitle("Quotation for " + (currentEnquiry?.customer_name || ""));
        setQuoteNo(`QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`);
        const defaultCompanyName =
          dealerProfile?.company_name ||
          membership?.unit_name ||
          membership?.org_name ||
          "";
        setFromName(defaultCompanyName);
        setFromAddress(dealerProfile?.address || "");
        setFromPhone(dealerProfile?.phone || "");
        setFromEmail(dealerProfile?.email || "");
        setFromGst(dealerProfile?.gstin || "");
        setFromPan(dealerProfile?.pan || "");
        setFromState(dealerProfile?.state || "");

        setToName(currentEnquiry?.customer_name || "");
        setToAddress(currentEnquiry?.address || "");
        setToContactPerson(currentEnquiry?.contact_person || "");
        setToPhone(currentEnquiry?.phone || "");
        setToEmail("");
        setToGst("");
        setToPan("");
        setToState("");

        setItems([{ ...EMPTY_ITEM, id: window.crypto.randomUUID() }]);
        const defaultBank = banks?.find(b => b.is_default) || banks?.[0];
        setBankId(defaultBank?.id || "");
        setTerms("1. 100% Advance Payment\n2. Validity: 30 days");
        setHasAgentCommission(Boolean(currentEnquiry?.agent_name));
        setAgentName(currentEnquiry?.agent_name || "");
        setCommissionType("PERCENTAGE");
        setCommissionRate(0);
      }
    }
  }, [open, existingQuote, currentEnquiry, banks, membership, dealerProfile]);

  // If dealer profile loads after modal opens for a new quote, update company name and address
  useEffect(() => {
    if (open && !existingQuote && dealerProfile) {
      if (!fromName || fromName === membership?.org_name) {
        setFromName(dealerProfile.company_name || membership?.unit_name || membership?.org_name || "");
      }
      if (!fromAddress && dealerProfile.address) {
        setFromAddress(dealerProfile.address);
      }
      if (!fromPhone && dealerProfile.phone) setFromPhone(dealerProfile.phone);
      if (!fromEmail && dealerProfile.email) setFromEmail(dealerProfile.email);
      if (!fromGst && dealerProfile.gstin) setFromGst(dealerProfile.gstin);
      if (!fromPan && dealerProfile.pan) setFromPan(dealerProfile.pan);
      if (!fromState && dealerProfile.state) setFromState(dealerProfile.state);
    }
  }, [open, existingQuote, dealerProfile, membership, fromName, fromAddress, fromPhone, fromEmail, fromGst, fromPan, fromState]);

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
  const activeCommission = hasAgentCommission ? commissionAmount : 0;
  
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnquiryId) {
      showAlert("Error", "Please select an enquiry first.");
      return;
    }
    
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
          agent_name: hasAgentCommission && agentName.trim() ? agentName.trim() : undefined,
          commission_type: hasAgentCommission && agentName.trim() ? commissionType : undefined,
          commission_rate: hasAgentCommission && agentName.trim() ? (commissionRate || 0) : undefined,
          commission_amount: hasAgentCommission && agentName.trim() ? commissionAmount : undefined,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err: any) => showAlert("Error", "Failed to save: " + JSON.stringify(err?.response?.data || err?.message || err)),
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
              </div>
            )}
            
            <div className={styles.field}>
              <label className={styles.label}>Quote Type</label>
              <select
                className={styles.select}
                value={quoteType}
                onChange={(e) => setQuoteType(e.target.value as QuoteType)}
                disabled={!!existingQuote}
              >
                <option value="NORMAL">Machine Quote</option>
                <option value="AMC">AMC Quote</option>
                <option value="SPARES">Spares Quote</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                              Quote Number <span style={{ color: "red" }}>*</span>
                          </label>
              <input
                required
                className={styles.input}
                value={quoteNo}
                onChange={(e) => setQuoteNo(e.target.value)}
              />
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
                    value={serviceInterval}
                    onChange={(e) => setServiceInterval(e.target.value)}
                    placeholder="e.g. 3 Months"
                  />
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
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
                <input required className={styles.input} value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Phone Number</label>
                  <input className={styles.input} value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} placeholder="e.g. 9876543210" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Email Address</label>
                  <input type="email" className={styles.input} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="e.g. info@company.com" />
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
                <textarea required className={styles.textarea} value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} style={{ minHeight: "50px" }} />
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
                <span style={{ fontSize: "0.72rem", color: "var(--color-text-3, #64748b)" }}>B2B & Tax details editable</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Customer Name <span style={{ color: "red" }}>*</span>
                </label>
                <input required className={styles.input} value={toName} onChange={(e) => setToName(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Contact Person</label>
                  <input className={styles.input} value={toContactPerson} onChange={(e) => setToContactPerson(e.target.value)} placeholder="e.g. Ramesh" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Phone Number</label>
                  <input className={styles.input} value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="e.g. 9876543210" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.label}>Email Address</label>
                  <input type="email" className={styles.input} value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="e.g. client@domain.com" />
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
                <textarea required className={styles.textarea} value={toAddress} onChange={(e) => setToAddress(e.target.value)} style={{ minHeight: "50px" }} />
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
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                            placeholder="Custom description..."
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="1"
                          className={styles.input}
                          value={item.quantity === 0 ? "" : item.quantity}
                          placeholder="1"
                          onChange={(e) => handleItemChange(item.id, "quantity", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          className={styles.input}
                          value={item.base_price === 0 ? "" : item.base_price}
                          placeholder="0"
                          onChange={(e) => handleItemChange(item.id, "base_price", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                        />
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

              {hasAgentCommission && commissionAmount > 0 && (
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

          {/* Agent Commission (Internal Only) */}
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
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Agent Cut (Commission)</label>
                    <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", fontWeight: 700, color: "#b45309", height: "38px", display: "flex", alignItems: "center" }}>
                      − ₹ {commissionAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>What We Get (Before Tax)</label>
                    <div style={{ padding: "8px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "6px", fontWeight: 700, color: "#047857", height: "38px", display: "flex", alignItems: "center" }}>
                      ₹ {ourNetBeforeTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Detailed Breakdown Strip */}
                <div style={{ marginTop: "var(--space-3)", padding: "14px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-3, #64748b)", fontWeight: 600 }}>1. Base Deal (Before Tax)</span>
                    <strong style={{ fontSize: "1.05rem", color: "var(--color-text, #0f172a)" }}>₹ {taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <span style={{ fontSize: "0.75rem", color: "#b45309" }}>Less Agent Cut: − ₹ {commissionAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderLeft: "2px solid #e2e8f0", paddingLeft: "14px" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#047857", fontWeight: 700 }}>2. What We Get (Before Tax)</span>
                    <strong style={{ fontSize: "1.1rem", color: "#047857" }}>₹ {ourNetBeforeTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <span style={{ fontSize: "0.75rem", color: "#065f46" }}>Retained Revenue ({ourNetBeforeTaxPercentage}%)</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderLeft: "2px solid #e2e8f0", paddingLeft: "14px" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--color-text-3, #64748b)", fontWeight: 600 }}>3. Customer Pays (With GST)</span>
                    <strong style={{ fontSize: "1.05rem", color: "var(--color-text, #0f172a)" }}>₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-3, #64748b)" }}>Includes GST: ₹ {taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderLeft: "2px solid #e2e8f0", paddingLeft: "14px" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#1e40af", fontWeight: 700 }}>4. Net Cash in Bank</span>
                    <strong style={{ fontSize: "1.1rem", color: "#1e40af" }}>₹ {ourCashInflowAfterCommission.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-3, #64748b)" }}>Customer Inflow minus Agent</span>
                  </div>
                </div>
              </div>
            )}
          </div>
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
