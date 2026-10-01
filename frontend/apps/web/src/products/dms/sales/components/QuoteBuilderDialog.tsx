/**
 * Quote Builder Dialog.
 *
 * Full-screen dialog for creating or editing a quotation.
 */

import { useEffect, useRef, useState } from "react";
import type { QuotationItem, QuoteType, AmcType } from "../api/types";
import { useBanks, useProductPresets, useEnquiries, useSaveQuotation } from "../hooks/useEnquiries";
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
  const saveQuote = useSaveQuotation();

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
  
  // To Details
  const [toName, setToName] = useState("");
  const [toAddress, setToAddress] = useState("");
  
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [bankId, setBankId] = useState("");
  const [terms, setTerms] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"DRAFT" | "QUOTE_SENT">("QUOTE_SENT");

  // Initialize form
  useEffect(() => {
    if (open) {
      if (existingQuote) {
        setQuoteType(existingQuote.type);
        if (existingQuote.amc_type) setAmcType(existingQuote.amc_type);
        if (existingQuote.service_interval) setServiceInterval(existingQuote.service_interval);
        
        setTitle(existingQuote.title);
        setQuoteNo(existingQuote.quote_no);
        setFromName(existingQuote.from_details.company_name);
        setFromAddress(existingQuote.from_details.address);
        setToName(existingQuote.to_details.company_name);
        setToAddress(existingQuote.to_details.address);
        setItems(existingQuote.items.map(i => ({ ...i })));
        setBankId(existingQuote.selected_bank_id);
        setTerms(existingQuote.terms);
      } else {
        // Defaults for new quote
        setTitle("Quotation for " + (currentEnquiry?.customer_name || ""));
        setQuoteNo(`QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`);
        setFromName("Acme Corp");
        setFromAddress("123 Industrial Area, Phase 1");
        setToName(currentEnquiry?.customer_name || "");
        setToAddress(currentEnquiry?.address || "");
        setItems([{ ...EMPTY_ITEM, id: window.crypto.randomUUID() }]);
        setBankId(banks?.[0]?.id || "");
        setTerms("1. 100% Advance Payment\n2. Validity: 30 days");
      }
    }
  }, [open, existingQuote, currentEnquiry, banks]);

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
      alert("Please select an enquiry first.");
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
          amc_type: quoteType === "AMC" ? amcType : null,
          service_interval: quoteType === "AMC" ? serviceInterval : null,
          status: existingQuote?.status === "DRAFT" ? submitStatus : (existingQuote?.status || submitStatus),
          from_details: { 
            company_name: fromName, 
            address: fromAddress,
            contact_person: "",
            phone: "",
            email: "",
            gst: "",
            pan: "",
            state: ""
          },
          to_details: { 
            company_name: toName, 
            address: toAddress,
            contact_person: "",
            phone: "",
            email: "",
            gst: "",
            pan: "",
            state: ""
          },
          items,
          selected_bank_id: bankId,
          terms,
        },
      },
      {
        onSuccess: () => onClose(),
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

      <form onSubmit={handleSave} className={styles.formContent}>
        <div className={styles.body}>
          {/* Top Section */}
          <div className={styles.grid2}>
            {/* If no enquiryId is passed via props, allow selection */}
            {!enquiryId && !existingQuote && (
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <label className={styles.label}>Select Enquiry</label>
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
                <option value="NORMAL">Normal Quote</option>
                <option value="AMC">AMC Quote</option>
                <option value="SPARES">Spares Quote</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Quote Number</label>
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
                  <label className={styles.label}>Service Interval</label>
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
              <label className={styles.label}>Quote Title</label>
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
              <h3 className={styles.cardTitle}>From (Our Details)</h3>
              <div className={styles.field}>
                <label className={styles.label}>Company Name</label>
                <input required className={styles.input} value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Address</label>
                <textarea required className={styles.textarea} value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
              </div>
            </div>

            {/* To Details */}
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>To (Customer)</h3>
              <div className={styles.field}>
                <label className={styles.label}>Customer Name</label>
                <input required className={styles.input} value={toName} onChange={(e) => setToName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Billing Address</label>
                <textarea required className={styles.textarea} value={toAddress} onChange={(e) => setToAddress(e.target.value)} />
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
                            {products?.filter(p => p.type === quoteType).map((p) => (
                              <option key={p.id} value={p.id}>{p.description}</option>
                            ))}
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
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          className={styles.input}
                          value={item.base_price}
                          onChange={(e) => handleItemChange(item.id, "base_price", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          className={styles.input}
                          value={item.margin}
                          onChange={(e) => handleItemChange(item.id, "margin", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          required
                          type="number"
                          min="0"
                          max="100"
                          className={styles.input}
                          value={item.gst_rate}
                          onChange={(e) => handleItemChange(item.id, "gst_rate", parseFloat(e.target.value) || 0)}
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
                <span>Subtotal (Taxable):</span>
                <span>₹ {taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Total Tax:</span>
                <span>₹ {taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Grand Total:</span>
                <span>₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className={styles.grid2}>
            {/* Bank Details */}
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Bank Details</h3>
              <div className={styles.field}>
                <label className={styles.label}>Select Bank Account</label>
                <select
                  required
                  className={styles.select}
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  <option value="" disabled>Select a bank...</option>
                  {banks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} - {b.account_no}
                    </option>
                  ))}
                </select>
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
                onClick={() => setSubmitStatus("DRAFT")}
                disabled={saveQuote.isPending}
              >
                Save as Draft
              </button>
            )}
            <button 
              type="submit" 
              className={styles.btnPrimary} 
              onClick={() => setSubmitStatus("QUOTE_SENT")}
              disabled={saveQuote.isPending}
            >
              {saveQuote.isPending ? "Saving..." : "Save & Finalize"}
            </button>
          </div>
        </div>
      </form>
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
