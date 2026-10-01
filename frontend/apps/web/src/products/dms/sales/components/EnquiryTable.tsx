/**
 * Enquiry table with expandable rows.
 *
 * Dumb component: props in, markup out. No useQuery, no router, no orgSlug.
 * The screen decides what data to pass; this draws it.
 */

import { useState } from "react";
import type { Enquiry } from "../api/types";
import { StatusBadge } from "./StatusBadge";
import styles from "./EnquiryTable.module.css";

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onAddFollowup: (enquiryId: string) => void;
  onCreateQuote: (enquiryId: string) => void;
  onEditQuote: (enquiryId: string, quoteId: string) => void;
  onConfirmOrder: (enquiryId: string, quoteId: string) => void;
  onDeleteQuote: (enquiryId: string, quoteId: string) => void;
}

export function EnquiryTable({
  enquiries,
  onAddFollowup,
  onCreateQuote,
  onEditQuote,
  onConfirmOrder,
  onDeleteQuote,
}: EnquiryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Customer</th>
            <th className={styles.th}>Contact</th>
            <th className={styles.th}>Latest Follow-up</th>
            <th className={styles.th}>Latest Quotation</th>
            <th className={`${styles.th} ${styles.thRight}`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {enquiries.map((enq) => (
            <EnquiryRow
              key={enq.id}
              enquiry={enq}
              isExpanded={expandedId === enq.id}
              isHistoryExpanded={expandedHistory === enq.id}
              onToggle={() => toggle(enq.id)}
              onToggleHistory={() =>
                setExpandedHistory(expandedHistory === enq.id ? null : enq.id)
              }
              onAddFollowup={() => onAddFollowup(enq.id)}
              onCreateQuote={() => onCreateQuote(enq.id)}
              onEditQuote={(quoteId) => onEditQuote(enq.id, quoteId)}
              onConfirmOrder={(quoteId) => onConfirmOrder(enq.id, quoteId)}
              onDeleteQuote={(quoteId) => onDeleteQuote(enq.id, quoteId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Row -------------------------------------------------------------------

interface EnquiryRowProps {
  enquiry: Enquiry;
  isExpanded: boolean;
  isHistoryExpanded: boolean;
  onToggle: () => void;
  onToggleHistory: () => void;
  onAddFollowup: () => void;
  onCreateQuote: () => void;
  onEditQuote: (quoteId: string) => void;
  onConfirmOrder: (quoteId: string) => void;
  onDeleteQuote: (quoteId: string) => void;
}

function EnquiryRow({
  enquiry,
  isExpanded,
  isHistoryExpanded,
  onToggle,
  onToggleHistory,
  onAddFollowup,
  onCreateQuote,
  onEditQuote,
  onConfirmOrder,
  onDeleteQuote,
}: EnquiryRowProps) {
  const latestFollowup = enquiry.followups[0] ?? null;
  const latestQuote = enquiry.quotes[enquiry.quotes.length - 1] ?? null;

  return (
    <>
      <tr
        className={`${styles.row} ${isExpanded ? styles.rowExpanded : ""}`}
        onClick={onToggle}
      >
        {/* Customer */}
        <td className={styles.td}>
          <div className={styles.customerName}>
            {enquiry.customer_name}
            {enquiry.status === "CONFIRMED" && (
              <StatusBadge status="CONFIRMED" />
            )}
          </div>
          <div className={styles.customerPhone}>
            <PhoneIcon /> {enquiry.phone}
          </div>
        </td>

        {/* Contact */}
        <td className={`${styles.td} ${styles.textSecondary}`}>
          {enquiry.contact_person}
        </td>

        {/* Latest Follow-up */}
        <td className={styles.td}>
          {latestFollowup ? (
            <div>
              <span className={styles.dateBadge}>
                {latestFollowup.next_followup_date}
              </span>
              <div className={styles.followupText}>
                {latestFollowup.remarks}
              </div>
            </div>
          ) : (
            <span className={styles.muted}>No follow-up yet</span>
          )}
        </td>

        {/* Latest Quotation */}
        <td className={styles.td}>
          {latestQuote ? (
            <div>
              <div className={styles.quoteTitle}>{latestQuote.title}</div>
              <div className={styles.quoteAmount}>
                ₹ {latestQuote.amount.toLocaleString("en-IN")}
              </div>
              <div className={styles.actions} style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="View Quote"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditQuote(latestQuote.id);
                  }}
                >
                  <EyeIcon />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Edit Quote"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditQuote(latestQuote.id);
                  }}
                >
                  <PencilIcon />
                </button>
              </div>
            </div>
          ) : (
            <span className={styles.muted}>No quotes yet</span>
          )}
        </td>

        {/* Actions */}
        <td className={`${styles.td} ${styles.tdRight}`}>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={(e) => {
                e.stopPropagation();
                onCreateQuote();
              }}
            >
              Create Quote
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={(e) => {
                e.stopPropagation();
                onAddFollowup();
              }}
            >
              <PlusIcon /> Follow-up
            </button>
            <button
              type="button"
              className={styles.expandBtn}
              aria-label={isExpanded ? "Collapse row" : "Expand row"}
            >
              {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded details */}
      {isExpanded && (
        <tr>
          <td colSpan={5} className={styles.expandedCell}>
            <div className={styles.expandedContent}>
              <div className={styles.detailGrid}>
                {/* Left: Enquiry details */}
                <div>
                  <h4 className={styles.sectionTitle}>Enquiry Details</h4>
                  <div className={styles.infoRow}>
                    <MapPinIcon />
                    <span>
                      {enquiry.address}
                      {enquiry.pincode ? ` - ${enquiry.pincode}` : ""}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <MessageIcon />
                    <span>{enquiry.remarks}</span>
                  </div>
                </div>

                {/* Right: Follow-up history */}
                <div>
                  <h4 className={styles.sectionTitle}>Follow-up History</h4>
                  {enquiry.followups.length > 0 ? (
                    <div className={styles.followupList}>
                      {/* Latest */}
                      <div className={styles.latestFollowup}>
                        <div className={styles.followupHeader}>
                          <span className={styles.followupDate}>
                            Due: {enquiry.followups[0]!.next_followup_date}
                          </span>
                          <span className={styles.followupAdded}>
                            Added {enquiry.followups[0]!.entered_date}
                          </span>
                        </div>
                        <p className={styles.followupRemark}>
                          {enquiry.followups[0]!.remarks}
                        </p>
                      </div>

                      {/* Older followups toggle */}
                      {enquiry.followups.length > 1 && (
                        <div>
                          <button
                            type="button"
                            className={styles.historyToggle}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleHistory();
                            }}
                          >
                            {isHistoryExpanded ? (
                              <ChevronUpIcon />
                            ) : (
                              <ChevronDownIcon />
                            )}
                            {isHistoryExpanded
                              ? "Hide past"
                              : `${String(enquiry.followups.length - 1)} older follow-up${enquiry.followups.length > 2 ? "s" : ""}`}
                          </button>

                          {isHistoryExpanded && (
                            <div className={styles.pastFollowups}>
                              {enquiry.followups.slice(1).map((f) => (
                                <div key={f.id} className={styles.pastItem}>
                                  <div className={styles.followupHeader}>
                                    <span className={styles.pastDate}>
                                      Due: {f.next_followup_date}
                                    </span>
                                    <span className={styles.followupAdded}>
                                      Added {f.entered_date}
                                    </span>
                                  </div>
                                  <p className={styles.followupRemark}>
                                    {f.remarks}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className={styles.muted}>No follow-ups yet.</p>
                  )}
                </div>
              </div>

              {/* Quotations section */}
              {enquiry.quotes.length > 0 && (
                <div
                  className={styles.quotesSection}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h4 className={styles.sectionTitle}>Generated Quotations</h4>
                  <div className={styles.quoteCards}>
                    {enquiry.quotes.map((quote) => (
                      <div key={quote.id} className={styles.quoteCard}>
                        {enquiry.status === "CONFIRMED" &&
                          enquiry.confirmed_quote_id === quote.id && (
                            <span className={styles.confirmedBadge}>
                              ✓ ORDER CONFIRMED
                            </span>
                          )}
                        <div className={styles.quoteCardTitle}>
                          {quote.title}
                        </div>
                        <div className={styles.quoteCardMeta}>
                          <span>#{quote.quote_no}</span>
                          <span>{quote.date}</span>
                        </div>
                        <div className={styles.quoteCardFooter}>
                          <span className={styles.quoteCardAmount}>
                            ₹ {quote.amount.toLocaleString("en-IN")}
                          </span>
                          <div className={styles.quoteCardActions}>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              title="View Quote"
                              onClick={() => onEditQuote(quote.id)}
                            >
                              <EyeIcon />
                            </button>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              title="Edit Quote"
                              onClick={() => onEditQuote(quote.id)}
                            >
                              <PencilIcon />
                            </button>
                            {enquiry.status !== "CONFIRMED" && (
                              <button
                                type="button"
                                className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                                title="Confirm Order"
                                onClick={() => onConfirmOrder(quote.id)}
                              >
                                <CheckIcon />
                              </button>
                            )}
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              title="Delete Quote"
                              onClick={() => onDeleteQuote(quote.id)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---- Inline SVG icons (no lucide dependency) --------------------------------

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={styles.infoIcon}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={styles.infoIcon}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
