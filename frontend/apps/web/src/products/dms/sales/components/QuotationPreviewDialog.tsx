import { useEffect, useRef } from "react";
import type { Quotation, Enquiry } from "../api/types";
import { useBanks } from "../hooks/useEnquiries";
import styles from "./QuotationPreviewDialog.module.css";

interface QuotationPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  quotation: Quotation;
  enquiry: Enquiry;
  onEdit?: () => void;
}

export function QuotationPreviewDialog({
  open,
  onClose,
  quotation,
  enquiry: _enquiry,
  onEdit,
}: QuotationPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: banks } = useBanks();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const bank = banks?.find((b) => b.id === quotation?.selected_bank_id);
  const items = quotation?.items || [];

  const taxableTotal = items.reduce((sum, item) => {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
    const price = typeof item.base_price === 'string' ? parseFloat(item.base_price) || 0 : item.base_price;
    const margin = item.margin === null || (item.margin as any) === "" ? 0 : (typeof item.margin === 'string' ? parseFloat(item.margin) || 0 : item.margin);
    return sum + (qty * price * (1 + margin / 100));
  }, 0);

  const taxTotal = items.reduce((sum, item) => {
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
    const price = typeof item.base_price === 'string' ? parseFloat(item.base_price) || 0 : item.base_price;
    const margin = item.margin === null || (item.margin as any) === "" ? 0 : (typeof item.margin === 'string' ? parseFloat(item.margin) || 0 : item.margin);
    const gst = typeof item.gst_rate === 'string' ? parseFloat(item.gst_rate) || 0 : item.gst_rate;
    const taxable = qty * price * (1 + margin / 100);
    return sum + (taxable * (gst / 100));
  }, 0);

  const grandTotal = taxableTotal + taxTotal;

  const handlePrint = () => {
    window.print();
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.dialogHeader}>
        <h2 className={styles.dialogTitle}>Quote Preview</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          {onEdit && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              Edit Quote
            </button>
          )}
          <button type="button" className={styles.btnPrimary} onClick={handlePrint}>
            <PrinterIcon /> Print
          </button>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.document}>
          <div className={styles.docHeader}>
            <div>
              <div className={styles.companyName}>{quotation?.from_details?.company_name || "Company"}</div>
              <p style={{ whiteSpace: "pre-line", fontSize: "0.9rem", color: "#555" }}>
                {quotation?.from_details?.address || ""}
              </p>
            </div>
            <div>
              <div className={styles.docTitle}>
                {quotation?.type === "AMC" ? "AMC QUOTATION" : quotation?.type === "SPARES" ? "SPARES QUOTATION" : "MACHINE QUOTATION"}
              </div>
              <div className={styles.metaGrid}>
                <span className={styles.metaLabel}>Quote No:</span>
                <span>{quotation?.quote_no || quotation?.id || "-"}</span>
                <span className={styles.metaLabel}>Date:</span>
                <span>{quotation?.date || "-"}</span>
                <span className={styles.metaLabel}>Valid Till:</span>
                <span>30 Days</span>
              </div>
            </div>
          </div>

          <div className={styles.addresses}>
            <div className={styles.addressBlock}>
              <h3>Bill To</h3>
              <p style={{ fontWeight: 600 }}>{quotation?.to_details?.company_name || _enquiry?.customer_name || "-"}</p>
              <p style={{ whiteSpace: "pre-line" }}>{quotation?.to_details?.address || _enquiry?.address || ""}</p>
            </div>
            <div className={styles.addressBlock}>
              <h3>Project Details</h3>
              {quotation?.title && <p><strong>Subject:</strong> {quotation.title}</p>}
              {quotation?.type === "AMC" && (
                <>
                  <p><strong>AMC Type:</strong> {quotation?.amc_type?.replace("_", " ") || "-"}</p>
                  <p><strong>Service Interval:</strong> {quotation?.service_interval || "-"}</p>
                </>
              )}
            </div>
          </div>

          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>Description</th>
                <th className={styles.alignRight}>Qty</th>
                <th className={styles.alignRight}>Rate (₹)</th>
                <th className={styles.alignRight}>Tax %</th>
                <th className={styles.alignRight}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
                const price = typeof item.base_price === 'string' ? parseFloat(item.base_price) || 0 : item.base_price;
                const margin = item.margin === null || (item.margin as any) === "" ? 0 : (typeof item.margin === 'string' ? parseFloat(item.margin) || 0 : item.margin);
                const finalRate = price * (1 + margin / 100);
                const amount = qty * finalRate;

                return (
                  <tr key={item.id || index}>
                    <td>{index + 1}</td>
                    <td>
                      <div><strong>{item.description}</strong></div>
                      {item.hsn && <div style={{ fontSize: "0.8rem", color: "#666" }}>HSN: {item.hsn}</div>}
                    </td>
                    <td className={styles.alignRight}>{qty}</td>
                    <td className={styles.alignRight}>{finalRate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={styles.alignRight}>{item.gst_rate}%</td>
                    <td className={styles.alignRight}>{amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal:</span>
              <span>₹ {taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Total Tax:</span>
              <span>₹ {taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className={`${styles.totalRow} ${styles.grandTotal}`}>
              <span>Total Amount:</span>
              <span>₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className={styles.footerGrid}>
            <div className={styles.footerBlock}>
              <h4>Terms & Conditions</h4>
              <p>{quotation.terms || "Standard terms apply."}</p>
            </div>
            <div className={styles.footerBlock}>
              <h4>Bank Details</h4>
              {bank ? (
                <>
                  <p><strong>Bank:</strong> {bank.bank_name}</p>
                  <p><strong>A/C No:</strong> {bank.account_no}</p>
                  <p><strong>IFSC:</strong> {bank.ifsc_code}</p>
                  {bank.branch_name && <p><strong>Branch:</strong> {bank.branch_name}</p>}
                </>
              ) : (
                <p>Bank details not selected.</p>
              )}
            </div>
          </div>
          
          <div style={{ marginTop: "60px", textAlign: "right", paddingRight: "40px" }}>
            <div style={{ borderTop: "1px solid #333", display: "inline-block", paddingTop: "10px", width: "200px", textAlign: "center", fontWeight: 600 }}>
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>
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

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
  );
}
