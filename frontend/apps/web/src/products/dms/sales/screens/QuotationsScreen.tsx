/**
 * Sales → Quotations screen.
 *
 * Shows all quotations generated across all enquiries.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, TableSkeleton } from "@xpredict/ui";

import { useEnquiries, useDeleteQuotation, useConfirmOrder } from "../hooks/useEnquiries";
import { QuoteBuilderDialog } from "../components/QuoteBuilderDialog";
import type { Enquiry, Quotation, QuoteType } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import styles from "./QuotationsScreen.module.css";

interface QuoteItem {
  quote: Quotation;
  enquiry: Enquiry;
}

export function QuotationsScreen() {
  const { data: enquiries, isPending, isError, error, refetch } = useEnquiries();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | QuoteType>("ALL");
  const [filterEnquiryId, setFilterEnquiryId] = useState<string>("ALL");

  const deleteQuote = useDeleteQuotation();
  const confirmOrder = useConfirmOrder();

  const [editingQuote, setEditingQuote] = useState<{
    enquiryId?: string;
    quoteId?: string;
  } | null>(null);

  // Flatten all quotes
  const allQuotes: QuoteItem[] = (enquiries ?? []).flatMap((enq) =>
    enq.quotes.map((q) => ({ quote: q, enquiry: enq })),
  );

  const filtered = allQuotes.filter((item) => {
    const matchesSearch = matches(item.quote.title, item.quote.quote_no, item.enquiry.customer_name, searchQuery);
    const matchesType = filterType === "ALL" || item.quote.type === filterType;
    const matchesEnquiry = filterEnquiryId === "ALL" || item.enquiry.id === filterEnquiryId;
    return matchesSearch && matchesType && matchesEnquiry;
  });

  const handleDelete = (enquiryId: string, quoteId: string) => {
    if (!window.confirm("Are you sure you want to delete this quote?")) return;
    deleteQuote.mutate({ enquiryId, quoteId });
  };

  const handleConfirm = (enquiryId: string, quoteId: string) => {
    if (!window.confirm("Confirm this order?")) return;
    confirmOrder.mutate({ enquiryId, quoteId });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Quotations</h1>
          <p className={styles.subtitle}>
            All quotations generated for customer enquiries.
          </p>
        </div>

        <div className={styles.headerActions}>
          {allQuotes.length > 0 && (
            <>
              <select
                className={styles.filterSelect}
                value={filterEnquiryId}
                onChange={(e) => setFilterEnquiryId(e.target.value)}
                title="Filter by Enquiry / Site"
              >
                <option value="ALL">All Enquiries</option>
                {enquiries?.map((enq) => (
                  <option key={enq.id} value={enq.id}>
                    {enq.customer_name}
                  </option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as "ALL" | QuoteType)}
                title="Filter by Quote Type"
              >
                <option value="ALL">All Types</option>
                <option value="NORMAL">Normal Quotes</option>
                <option value="AMC">AMC Quotes</option>
                <option value="SPARES">Spares Quotes</option>
              </select>

              <label className={styles.search}>
                <span className={styles.srOnly}>Search quotations</span>
                <SearchIcon />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Search quotes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </>
          )}

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setEditingQuote({})}
          >
            <PlusCircleIcon /> Create Quote
          </button>
        </div>
      </header>

      {/* ---- Four states ---- */}

      {isPending && (
        <TableSkeleton label="quotations" columns={[200, 150, 180, 140, "grow"]} rows={3} />
      )}

      {isError && (
        <ErrorState
          title="Could not load quotations"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {allQuotes.length === 0 && !searchQuery && enquiries && (
        <EmptyState
          title="No quotations yet"
          body="Go to the Enquiries tab to create your first quote, or create one here."
        />
      )}

      {filtered.length === 0 && searchQuery && allQuotes.length > 0 && (
        <EmptyState
          title="No quotations match your search"
          body="Try a different search term."
          action={
            <button type="button" className={styles.clearBtn} onClick={() => setSearchQuery("")}>
              Clear search
            </button>
          }
        />
      )}

      {filtered.length > 0 && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Quote No & Title</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Customer</th>
                <th className={styles.th}>Amount</th>
                <th className={styles.th}>Date</th>
                <th className={`${styles.th} ${styles.thRight}`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ quote, enquiry }) => {
                const isConfirmed = enquiry.confirmed_quote_id === quote.id;
                return (
                  <tr key={quote.id} className={styles.row}>
                    <td className={styles.td}>
                      <div className={styles.quoteTitle}>{quote.title}</div>
                      <div className={styles.quoteNo}>{quote.quote_no}</div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.quoteTypeBadge}>{quote.type}</span>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.customerName}>{enquiry.customer_name}</div>
                      {isConfirmed && <StatusBadge status="CONFIRMED" />}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.amount}>
                        ₹ {quote.amount.toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.date}>{quote.date}</span>
                    </td>
                    <td className={`${styles.td} ${styles.tdRight}`}>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          title="View Quote"
                          onClick={() => setEditingQuote({ enquiryId: enquiry.id, quoteId: quote.id })}
                        >
                          <EyeIcon />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          title="Edit Quote"
                          onClick={() => setEditingQuote({ enquiryId: enquiry.id, quoteId: quote.id })}
                        >
                          <PencilIcon />
                        </button>
                        {!isConfirmed && enquiry.status !== "CONFIRMED" && (
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                            title="Confirm Order"
                            onClick={() => handleConfirm(enquiry.id, quote.id)}
                          >
                            <CheckIcon />
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          title="Delete Quote"
                          onClick={() => handleDelete(enquiry.id, quote.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Full-screen Quote Builder Modal */}
      {editingQuote && (
        <QuoteBuilderDialog
          open={true}
          onClose={() => setEditingQuote(null)}
          enquiryId={editingQuote.enquiryId}
          existingQuoteId={editingQuote.quoteId}
        />
      )}
    </div>
  );
}

function matches(title: string, no: string, customer: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${title} ${no} ${customer}`.toLowerCase().includes(needle);
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.1 3.1" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
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
