/**
 * Sales → Confirmed Orders screen.
 *
 * Shows only enquiries with status === "CONFIRMED", with the ability to
 * unconfirm and add followups. Mirrors the dummy UI's confirmed-orders view.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, TableSkeleton } from "@xpredict/ui";

import { useEnquiries, useUnconfirmOrder, useAddFollowup, useUpdateEnquiry, useDeleteEnquiry } from "../hooks/useEnquiries";
import { FollowupDialog } from "../components/FollowupDialog";
import { QuoteBuilderDialog } from "../components/QuoteBuilderDialog";
import { NewEnquiryDialog } from "../components/NewEnquiryDialog";
import type { Enquiry, NewFollowup, NewEnquiry } from "../api/types";
import styles from "./ConfirmedOrdersScreen.module.css";

export function ConfirmedOrdersScreen() {
  const { data: enquiries, isPending, isError, error, refetch } = useEnquiries();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [editingQuote, setEditingQuote] = useState<{
    enquiryId: string;
    quoteId: string;
  } | null>(null);
  const [editingOrder, setEditingOrder] = useState<Enquiry | null>(null);

  // Followup dialog
  const [followupOrderId, setFollowupOrderId] = useState<string | null>(null);
  const addFollowup = useAddFollowup();
  const unconfirm = useUnconfirmOrder();
  const updateEnquiry = useUpdateEnquiry();
  const deleteEnquiry = useDeleteEnquiry();

  const confirmedOrders = enquiries?.filter(
    (e) =>
      e.status === "CONFIRMED" &&
      (matches(e.customer_name, e.oc_number ?? "", searchQuery)),
  );

  const handleUnconfirm = (enquiryId: string) => {
    if (!window.confirm("Unconfirm this order? It will return to Pending status.")) return;
    unconfirm.mutate(enquiryId);
  };

  const handleDelete = (enquiryId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this order?")) return;
    deleteEnquiry.mutate(enquiryId);
  };

  const handleFollowup = (body: NewFollowup) => {
    if (!followupOrderId) return;
    addFollowup.mutate(
      { enquiryId: followupOrderId, body },
      { onSuccess: () => setFollowupOrderId(null) },
    );
  };

  const handleUpdateEnquiry = (body: NewEnquiry) => {
    if (!editingOrder) return;
    updateEnquiry.mutate(
      { enquiryId: editingOrder.id, body },
      { onSuccess: () => setEditingOrder(null) },
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Confirmed Orders</h1>
          <p className={styles.subtitle}>
            Manage confirmed orders and view Order Confirmation (OC) numbers.
          </p>
        </div>

        {confirmedOrders && confirmedOrders.length > 0 && (
          <label className={styles.search}>
            <span className={styles.srOnly}>Search orders</span>
            <SearchIcon />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by name or OC No..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        )}
      </header>

      {/* ---- Four states ---- */}

      {isPending && (
        <TableSkeleton label="orders" columns={[200, 120, 180, 140, "grow"]} rows={3} />
      )}

      {isError && (
        <ErrorState
          title="Could not load orders"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {confirmedOrders && confirmedOrders.length === 0 && !searchQuery && (
        <EmptyState
          title="No confirmed orders"
          body="Confirm a quote in the Enquiries tab to see it here."
        />
      )}

      {confirmedOrders && confirmedOrders.length === 0 && searchQuery && (
        <EmptyState
          title="No orders match your search"
          body="Try a different search term."
          action={
            <button type="button" className={styles.clearBtn} onClick={() => setSearchQuery("")}>
              Clear search
            </button>
          }
        />
      )}

      {confirmedOrders && confirmedOrders.length > 0 && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Customer</th>
                <th className={styles.th}>Contact</th>
                <th className={styles.th}>Confirmed Quote</th>
                <th className={styles.th}>OC Number</th>
                <th className={`${styles.th} ${styles.thRight}`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {confirmedOrders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  isExpanded={expandedId === order.id}
                  isHistoryExpanded={expandedHistory === order.id}
                  onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                  onToggleHistory={() => setExpandedHistory(expandedHistory === order.id ? null : order.id)}
                  onFollowup={() => setFollowupOrderId(order.id)}
                  onUnconfirm={() => handleUnconfirm(order.id)}
                  onDelete={() => handleDelete(order.id)}
                  onEditOrder={() => setEditingOrder(order)}
                  onViewQuote={() =>
                    order.confirmed_quote_id
                      ? setEditingQuote({ enquiryId: order.id, quoteId: order.confirmed_quote_id })
                      : null
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FollowupDialog
        open={followupOrderId !== null}
        onClose={() => setFollowupOrderId(null)}
        onSubmit={handleFollowup}
        isPending={addFollowup.isPending}
      />

      {editingQuote && (
        <QuoteBuilderDialog
          open={true}
          onClose={() => setEditingQuote(null)}
          enquiryId={editingQuote.enquiryId}
          existingQuoteId={editingQuote.quoteId}
        />
      )}

      {editingOrder && (
        <NewEnquiryDialog
          open={true}
          onClose={() => setEditingOrder(null)}
          onSubmit={handleUpdateEnquiry}
          isPending={updateEnquiry.isPending}
          initialData={editingOrder}
        />
      )}
    </div>
  );
}

// ---- Row component ---------------------------------------------------------

interface OrderRowProps {
  order: Enquiry;
  isExpanded: boolean;
  isHistoryExpanded: boolean;
  onToggle: () => void;
  onToggleHistory: () => void;
  onFollowup: () => void;
  onUnconfirm: () => void;
  onDelete: () => void;
  onEditOrder: () => void;
  onViewQuote: () => void;
}

function OrderRow({ order, isExpanded, isHistoryExpanded, onToggle, onToggleHistory, onFollowup, onUnconfirm, onDelete, onEditOrder, onViewQuote }: OrderRowProps) {
  const confirmedQuote = order.quotes.find((q) => q.id === order.confirmed_quote_id);

  return (
    <>
      <tr
        className={`${styles.row} ${isExpanded ? styles.rowExpanded : ""}`}
        onClick={onToggle}
      >
        <td className={styles.td}>
          <div className={styles.customerName}>{order.customer_name}</div>
          <div className={styles.customerPhone}>
            <PhoneIcon /> {order.phone}
          </div>
        </td>
        <td className={`${styles.td} ${styles.textSecondary}`}>{order.contact_person}</td>
        <td className={styles.td}>
          {confirmedQuote ? (
            <div>
              <div className={styles.quoteTitle}>{confirmedQuote.title}</div>
              <div className={styles.quoteAmount}>
                ₹ {confirmedQuote.amount.toLocaleString("en-IN")}
              </div>
            </div>
          ) : (
            <span className={styles.muted}>—</span>
          )}
        </td>
        <td className={styles.td}>
          <div className={styles.ocNumber}>
            <FileIcon />
            <span>{order.oc_number ?? "Pending"}</span>
          </div>
        </td>
        <td className={`${styles.td} ${styles.tdRight}`}>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.iconBtn}
              title="Edit Order Details"
              onClick={(e) => { e.stopPropagation(); onEditOrder(); }}
            >
              <PencilIcon />
            </button>
            {confirmedQuote && (
              <button
                type="button"
                className={styles.iconBtn}
                title="View Quote"
                onClick={(e) => { e.stopPropagation(); onViewQuote(); }}
              >
                <EyeIcon />
              </button>
            )}
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={(e) => { e.stopPropagation(); onFollowup(); }}
            >
              <PlusIcon /> Follow-up
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={(e) => { e.stopPropagation(); onUnconfirm(); }}
              title="Unconfirm Order (Revert to Pending)"
            >
              <ArrowLeftIcon /> Unconfirm
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete Order Completely"
            >
              <TrashIcon />
            </button>
            <button type="button" className={styles.expandBtn} aria-label="Toggle details">
              {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} className={styles.expandedCell}>
            <div className={styles.expandedContent}>
              <div className={styles.detailGrid}>
                <div>
                  <h4 className={styles.sectionTitle}>Order Details</h4>
                  <div className={styles.infoRow}>
                    <MapPinIcon /> <span>{order.address}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <MessageIcon /> <span>{order.remarks}</span>
                  </div>
                </div>
                <div>
                  <h4 className={styles.sectionTitle}>Follow-up History</h4>
                  {order.followups.length > 0 ? (
                    <div className={styles.followupList}>
                      {/* Latest */}
                      <div className={styles.latestFollowup}>
                        <div className={styles.followupHeader}>
                          <span className={styles.followupDate}>
                            Due: {order.followups[0]!.next_followup_date}
                          </span>
                          <span className={styles.followupAdded}>
                            Added {order.followups[0]!.entered_date}
                          </span>
                        </div>
                        <p className={styles.followupRemark}>
                          {order.followups[0]!.remarks}
                        </p>
                      </div>

                      {/* Older followups toggle */}
                      {order.followups.length > 1 && (
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
                              : `${String(order.followups.length - 1)} older follow-up${order.followups.length > 2 ? "s" : ""}`}
                          </button>

                          {isHistoryExpanded && (
                            <div className={styles.pastFollowups}>
                              {order.followups.slice(1).map((f) => (
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
                    <p className={styles.muted}>No follow-ups.</p>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---- Helpers & icons -------------------------------------------------------

function matches(name: string, oc: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${name} ${oc}`.toLowerCase().includes(needle);
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.1 3.1" />
    </svg>
  );
}

function PhoneIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
}

function ArrowLeftIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 8 8 12 12 16" /><line x1="16" y1="12" x2="8" y2="12" /></svg>;
}

function FileIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
}

function ChevronDownIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>;
}

function ChevronUpIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>;
}

function MapPinIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={styles.infoIcon}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}

function MessageIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={styles.infoIcon}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
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
