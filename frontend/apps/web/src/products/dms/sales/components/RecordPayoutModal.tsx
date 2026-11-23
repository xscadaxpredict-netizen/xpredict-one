import React, { useState, useRef, useEffect } from "react";
import { useRecordCommissionPayment } from "../hooks/useEnquiries";
import type { AgentPayoutItem } from "../api/types";
import styles from "./RecordPayoutModal.module.css";

export interface PayoutTargetRecord {
  type: "COMMISSION" | "LEAD_FEE";
  id?: string;
  reference_id: string;
  agent_name: string;
  customer_name?: string;
  deal_title?: string;
  amount: number;
  paid_amount?: number;
  balance_amount?: number;
  status: string;
  payouts?: AgentPayoutItem[];
}

interface RecordPayoutModalProps {
  open: boolean;
  onClose: () => void;
  record: PayoutTargetRecord | null;
  onSuccess?: () => void;
}

export function RecordPayoutModal({
  open,
  onClose,
  record,
  onSuccess,
}: RecordPayoutModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordPayment = useRecordCommissionPayment();

  const totalAmount = record?.amount || 0;
  const paidAmount = record?.paid_amount || 0;
  const balanceAmount = record?.balance_amount !== undefined 
    ? record.balance_amount 
    : Math.max(0, totalAmount - paidAmount);

  const [amount, setAmount] = useState<number>(balanceAmount || totalAmount);
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().split("T")[0] || "");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open && record) {
      recordPayment.reset();
      const bal = record.balance_amount !== undefined 
        ? record.balance_amount 
        : Math.max(0, (record.amount || 0) - (record.paid_amount || 0));
      setAmount(bal > 0 ? bal : record.amount || 0);
      setPaymentRef("");
      setPaidAt(new Date().toISOString().split("T")[0] || "");
      setNotes("");
      setFiles([]);
    }
  }, [open, record]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !paymentRef.trim() || !amount || amount <= 0) return;

    if (files.length > 0) {
      const formData = new FormData();
      formData.append("type", record.type);
      formData.append("reference_id", record.reference_id);
      formData.append("payment_ref", paymentRef.trim());
      formData.append("amount", String(amount));
      formData.append("paid_at", paidAt);
      if (notes.trim()) formData.append("notes", notes.trim());
      files.forEach((f) => {
        formData.append("proofs", f);
      });

      recordPayment.mutate(formData, {
        onSuccess: () => {
          onClose();
          onSuccess?.();
        },
      });
    } else {
      recordPayment.mutate(
        {
          type: record.type,
          reference_id: record.reference_id,
          payment_ref: paymentRef.trim(),
          amount,
          paid_at: paidAt,
          notes: notes.trim(),
        },
        {
          onSuccess: () => {
            onClose();
            onSuccess?.();
          },
        }
      );
    }
  };

  if (!record) return null;

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.header}>
        <h2 className={styles.title}>Record Agent Payout / Installment</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.body}>
          {/* Summary Box */}
          <div className={styles.summaryBox}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Agent / Referrer:</span>
              <strong style={{ fontSize: "1rem" }}>{record.agent_name}</strong>
            </div>
            {record.customer_name && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Customer / Deal:</span>
                <span>{record.customer_name} {record.deal_title ? `(${record.deal_title})` : ""}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Commercial Type:</span>
              <span>{record.type === "COMMISSION" ? "Deal Commission" : "Lead Sourcing Fee"}</span>
            </div>

            {/* Metrics Breakdown */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCol}>
                <span className={styles.metricTitle}>Total Commission</span>
                <span className={styles.metricVal}>
                  ₹ {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className={styles.metricCol}>
                <span className={styles.metricTitle}>Already Paid</span>
                <span className={styles.metricVal} style={{ color: "#047857" }}>
                  ₹ {paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className={styles.metricCol}>
                <span className={styles.metricTitle}>Remaining Balance</span>
                <span className={styles.metricVal} style={{ color: balanceAmount > 0 ? "#b45309" : "#64748b" }}>
                  ₹ {balanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Form Fields or Fully Paid Banner */}
          {balanceAmount <= 0 ? (
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "12px 16px", borderRadius: "8px", fontWeight: 600, fontSize: "0.875rem", marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              ✓ This commission has been fully settled. No further payout required.
            </div>
          ) : (
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="payout-amount">
                  Installment Amount to Pay (₹) <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  id="payout-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  max={balanceAmount > 0 ? balanceAmount : undefined}
                  required
                  className={styles.input}
                  value={amount || ""}
                  placeholder="Enter payout amount"
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                />
                {balanceAmount > 0 && amount < balanceAmount && (
                  <span style={{ fontSize: "0.75rem", color: "#b45309" }}>
                    Partial payment. Balance after this: ₹{(balanceAmount - amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="payout-date">
                  Payment Date <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  id="payout-date"
                  type="date"
                  required
                  className={styles.input}
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="payout-ref">
                  Bank UTR / Transaction Reference Number <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  id="payout-ref"
                  type="text"
                  required
                  className={styles.input}
                  placeholder="e.g. UTR1284910482 / IMPS / Cheque #4928"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="payout-notes">
                  Payment Remarks / Notes (Optional)
                </label>
                <textarea
                  id="payout-notes"
                  className={styles.textarea}
                  placeholder="e.g. Installment 1 of 2 via HDFC Netbanking"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Proof Uploads */}
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>
                  Upload Payment Proof(s) (Screenshot / Bank Advice / PDF)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div
                  className={styles.fileUploadArea}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-primary, #0f172a)" }}>
                    Click to select proof receipts / screenshots
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-3, #64748b)" }}>
                    You can select multiple images or PDF files
                  </span>
                </div>

                {files.length > 0 && (
                  <div className={styles.fileChips}>
                    {files.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className={styles.fileChip}>
                        <span>{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                        <button
                          type="button"
                          className={styles.removeFileBtn}
                          onClick={() => handleRemoveFile(idx)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {recordPayment.isError && (
            <div style={{ color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", marginTop: "14px" }}>
              <strong>Payment Failed:</strong> {(recordPayment.error as any)?.detail || (recordPayment.error as any)?.message || "Could not record payout. Please try again."}
            </div>
          )}

          {/* Previous Installments History */}
          {record.payouts && record.payouts.length > 0 && (
            <div className={styles.historySection}>
              <h4 className={styles.historyTitle}>
                <span>Installments Paid So Far ({record.payouts.length})</span>
                <span style={{ color: "#047857", fontWeight: 700 }}>
                  Total: ₹{paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </h4>
              <div className={styles.historyTableContainer}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>UTR / Ref</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Proofs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.payouts.map((p) => (
                      <tr key={p.id}>
                        <td>{p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-IN") : "—"}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{p.payment_ref}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#047857" }}>
                          ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          {p.attachments && p.attachments.length > 0 ? (
                            p.attachments.map((att) => (
                              <a
                                key={att.id}
                                href={att.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.attachmentLink}
                                title={att.file_name}
                              >
                                📎 {att.file_name.length > 15 ? att.file_name.slice(0, 15) + "…" : att.file_name}
                              </a>
                            ))
                          ) : (
                            <span style={{ color: "var(--color-text-3, #94a3b8)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={recordPayment.isPending}
          >
            {balanceAmount <= 0 ? "Close" : "Cancel"}
          </button>
          {balanceAmount > 0 && (
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={recordPayment.isPending || !paymentRef.trim() || amount <= 0}
            >
              {recordPayment.isPending ? "Recording…" : "Confirm Payout"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

