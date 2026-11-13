/**
 * Sales → Confirmed Orders screen.
 *
 * Shows only enquiries with status === "CONFIRMED", with the ability to
 * unconfirm and add followups. Mirrors the dummy UI's confirmed-orders view.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, TableSkeleton, ConfirmDialog } from "@xpredict/ui";

import { useEnquiries, useUnconfirmOrder, useAddFollowup, useUpdateEnquiry, useDeleteEnquiry } from "../hooks/useEnquiries";
import { FollowupDialog } from "../components/FollowupDialog";
import { QuoteBuilderDialog } from "../components/QuoteBuilderDialog";
import { QuotationPreviewDialog } from "../components/QuotationPreviewDialog";
import { NewEnquiryDialog } from "../components/NewEnquiryDialog";
import { RecordPayoutModal, type PayoutTargetRecord } from "../components/RecordPayoutModal";
import type { Enquiry, NewFollowup, NewEnquiry, Quotation } from "../api/types";
import { useDialog } from "../../shared/hooks/useDialog";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
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
  const [viewingQuote, setViewingQuote] = useState<{
    enquiry: Enquiry;
    quote: import("../api/types").Quotation;
  } | null>(null);
  const [editingOrder, setEditingOrder] = useState<Enquiry | null>(null);
  const [payingCommissionRecord, setPayingCommissionRecord] = useState<PayoutTargetRecord | null>(null);

  const handleOpenAgentPayout = (quote: Quotation, order: Enquiry) => {
    setPayingCommissionRecord({
      type: "COMMISSION",
      reference_id: quote.id,
      agent_name: quote.agent_name || order.agent_name || "",
      customer_name: order.customer_name,
      deal_title: quote.title || quote.quote_no,
      amount: quote.commission_amount || 0,
      paid_amount: quote.paid_amount || 0,
      balance_amount: quote.balance_amount !== undefined 
        ? quote.balance_amount 
        : Math.max(0, (quote.commission_amount || 0) - (quote.paid_amount || 0)),
      status: quote.commission_status || "PAYABLE",
      payouts: quote.payouts,
    });
  };

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    intent: "primary" | "danger";
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  
  const { DialogComponent } = useDialog();

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
    setConfirmState({
      title: "Unconfirm Order",
      message: "Unconfirm this order? It will return to Pending status.",
      intent: "danger",
      confirmLabel: "Unconfirm",
      onConfirm: () => unconfirm.mutate(enquiryId)
    });
  };

  const handleDelete = (enquiryId: string) => {
    setConfirmState({
      title: "Delete Order",
      message: "Are you sure you want to permanently delete this order?",
      intent: "danger",
      confirmLabel: "Delete",
      onConfirm: () => deleteEnquiry.mutate(enquiryId)
    });
  };

  const handleFollowup = (body: NewFollowup) => {
    if (!followupOrderId) return;
    addFollowup.mutate(
      { enquiryId: followupOrderId, body },
      {
        onSuccess: () => {
          setFollowupOrderId(null);
        },
      },
    );
  };

  const handleUpdateEnquiry = (body: NewEnquiry) => {
    if (!editingOrder) return;
    updateEnquiry.mutate(
      { enquiryId: editingOrder.id, body },
      {
        onSuccess: () => {
          setEditingOrder(null);
        },
      },
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

        {enquiries && enquiries.filter((e) => e.status === "CONFIRMED").length > 0 && (
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
                  onViewQuote={() => {
                    const quote = order.quotes.find(q => q.id === order.confirmed_quote_id);
                    if (quote) {
                      setViewingQuote({ enquiry: order, quote });
                    }
                  }}
                  onRecordAgentPayout={handleOpenAgentPayout}
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

      {viewingQuote && (
        <QuotationPreviewDialog
          open={true}
          onClose={() => setViewingQuote(null)}
          quotation={viewingQuote.quote}
          enquiry={viewingQuote.enquiry}
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

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        intent={confirmState?.intent || "primary"}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
      <RecordPayoutModal
        open={payingCommissionRecord !== null}
        onClose={() => setPayingCommissionRecord(null)}
        record={payingCommissionRecord}
        onSuccess={() => refetch()}
      />
      <DialogComponent />
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
  onRecordAgentPayout?: (quote: Quotation, order: Enquiry) => void;
}

function OrderRow({ order, isExpanded, isHistoryExpanded, onToggle, onToggleHistory, onFollowup, onUnconfirm, onDelete, onEditOrder, onViewQuote, onRecordAgentPayout }: OrderRowProps) {
  const { canEditEnquiry, canUnconfirmOrder, canDeleteOrder } = useDmsPermissions();
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
              {confirmedQuote.agent_name && (
                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text, #0f172a)" }}>
                    👤 Agent: {confirmedQuote.agent_name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#047857" }}>
                      Comm: ₹{Number(confirmedQuote.commission_amount || 0).toLocaleString("en-IN")}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "1px 6px",
                        borderRadius: "9999px",
                        fontWeight: 600,
                        background:
                          confirmedQuote.commission_status === "PAID"
                            ? "#f1f5f9"
                            : confirmedQuote.commission_status === "PARTIALLY_PAID"
                            ? "#fef3c7"
                            : "#ecfdf5",
                        color:
                          confirmedQuote.commission_status === "PAID"
                            ? "#475569"
                            : confirmedQuote.commission_status === "PARTIALLY_PAID"
                            ? "#92400e"
                            : "#047857",
                      }}
                    >
                      {confirmedQuote.commission_status === "PAID"
                        ? "Paid"
                        : confirmedQuote.commission_status === "PARTIALLY_PAID"
                        ? `Partial (₹${Number(confirmedQuote.paid_amount || 0).toLocaleString("en-IN")} paid)`
                        : "Payable"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecordAgentPayout?.(confirmedQuote, order);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      textDecoration: "underline",
                      fontSize: "0.74rem",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 0,
                      marginTop: "3px",
                    }}
                  >
                    {confirmedQuote.commission_status === "PAID" ? "View Proofs & History" : "Record Payout / Installment"}
                  </button>
                </div>
              )}
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
            {confirmedQuote?.agent_name && (
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                title="Agent Payout & Installments"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecordAgentPayout?.(confirmedQuote, order);
                }}
              >
                Agent Payout
              </button>
            )}
            {canEditEnquiry && (
              <button
                type="button"
                className={styles.iconBtn}
                title="Edit Order Details"
                onClick={(e) => { e.stopPropagation(); onEditOrder(); }}
              >
                <PencilIcon />
              </button>
            )}
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
            {canEditEnquiry && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={(e) => { e.stopPropagation(); onFollowup(); }}
              >
                <PlusIcon /> Follow-up
              </button>
            )}
            {canUnconfirmOrder && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={(e) => { e.stopPropagation(); onUnconfirm(); }}
                title="Unconfirm Order (Revert to Pending)"
              >
                <ArrowLeftIcon /> Unconfirm
              </button>
            )}
            {canDeleteOrder && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete Order Completely"
              >
                <TrashIcon />
              </button>
            )}
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
              <div className={styles.mobileActionsBar}>
                {confirmedQuote?.agent_name && (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "36px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecordAgentPayout?.(confirmedQuote, order);
                    }}
                  >
                    👤 Agent Payout
                  </button>
                )}
                {canEditEnquiry && (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={(e) => { e.stopPropagation(); onFollowup(); }}
                  >
                    <PlusIcon /> Follow-up
                  </button>
                )}
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
                {canEditEnquiry && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Edit Order"
                    onClick={(e) => { e.stopPropagation(); onEditOrder(); }}
                  >
                    <PencilIcon />
                  </button>
                )}
                {canUnconfirmOrder && (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    title="Unconfirm Order"
                    onClick={(e) => { e.stopPropagation(); onUnconfirm(); }}
                  >
                    <ArrowLeftIcon /> Unconfirm
                  </button>
                )}
                {canDeleteOrder && (
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete Order"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              <div className={styles.detailGrid}>
                <div>
                  <h4 className={styles.sectionTitle}>Order Details</h4>
                  <div className={styles.infoRow}>
                    <MapPinIcon /> <span>{order.address}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <MessageIcon /> <span>{order.remarks}</span>
                  </div>
                  {order.agent_name && (
                    <div className={styles.infoRow} style={{ marginTop: "6px" }}>
                      <UserIcon />
                      <span>
                        <strong>Agent / Referrer:</strong> {order.agent_name}
                        {Number(order.lead_fee) > 0 ? (
                          <span style={{ marginLeft: "8px", color: "#7e22ce", fontWeight: 600 }}>
                            (Lead Sourcing Fee: ₹{Number(order.lead_fee).toLocaleString("en-IN")}{order.lead_fee_status ? ` • ${order.lead_fee_status}` : ""})
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {confirmedQuote?.agent_name && (
                    <div style={{ marginTop: "12px", padding: "10px 12px", background: "var(--color-surface-subtle, #f8fafc)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text, #0f172a)" }}>
                          Deal Commission ({confirmedQuote.agent_name})
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRecordAgentPayout?.(confirmedQuote, order);
                          }}
                          style={{
                            background: "var(--color-primary, #0f172a)",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "4px",
                            padding: "3px 8px",
                            fontSize: "0.74rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          {confirmedQuote.commission_status === "PAID" ? "View History" : "Record Payout / Installments"}
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "0.78rem" }}>
                        <span>Total: <strong>₹{Number(confirmedQuote.commission_amount || 0).toLocaleString("en-IN")}</strong></span>
                        <span style={{ color: "#047857" }}>Paid: <strong>₹{Number(confirmedQuote.paid_amount || 0).toLocaleString("en-IN")}</strong></span>
                        <span style={{ color: "#b45309" }}>
                          Balance Due: <strong>₹{Number(confirmedQuote.balance_amount !== undefined ? confirmedQuote.balance_amount : Math.max(0, (confirmedQuote.commission_amount || 0) - (confirmedQuote.paid_amount || 0))).toLocaleString("en-IN")}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className={styles.sectionTitle}>Follow-up History</h4>
                  {order.followups.length > 0 ? (
                    <div className={styles.followupList}>
                      {/* Latest */}
                      <div className={styles.latestFollowup}>
                        <div className={styles.followupHeader}>
                          <span className={styles.followupDate}>
                            {order.followups[0]!.next_followup_date ? `Due: ${order.followups[0]!.next_followup_date}` : "No date set"}
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
                                      {f.next_followup_date ? `Due: ${f.next_followup_date}` : "No date set"}
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

function UserIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.infoIcon}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
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


