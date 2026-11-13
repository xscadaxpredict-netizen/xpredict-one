import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { TableSkeleton, EmptyState, ErrorState } from "@xpredict/ui";
import { useCommissions } from "../hooks/useEnquiries";
import { RecordPayoutModal, type PayoutTargetRecord } from "../components/RecordPayoutModal";
import type { AgentCommissionRecord } from "../api/types";
import styles from "./CommissionsScreen.module.css";

export function CommissionsScreen() {
  const { data: commissions, isPending, isError, error, refetch } = useCommissions();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const [payingRecord, setPayingRecord] = useState<PayoutTargetRecord | null>(null);

  const handleOpenPayment = (record: AgentCommissionRecord) => {
    setPayingRecord({
      type: record.type,
      id: record.id,
      reference_id: record.reference_id,
      agent_name: record.agent_name,
      customer_name: record.customer_name,
      deal_title: record.deal_title,
      amount: record.amount,
      paid_amount: record.paid_amount,
      balance_amount: record.balance_amount,
      status: record.status,
      payouts: record.payouts,
    });
  };

  const handleClosePayment = () => {
    setPayingRecord(null);
  };

  if (isPending) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Agent Commissions & Referrals</h1>
            <p className={styles.subtitle}>Loading agent commercials and dues…</p>
          </div>
        </div>
        <TableSkeleton label="commissions" rows={5} columns={[150, 150, 180, 140, "grow"]} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <ErrorState
          title="Could not load agent commissions"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const items = commissions || [];

  // Metrics
  const totalPaid = items.reduce((sum, i) => sum + (Number(i.paid_amount) || 0), 0);

  const totalPayable = items
    .filter((i) => i.status === "PAYABLE" || i.status === "PARTIALLY_PAID")
    .reduce((sum, i) => {
      const total = Number(i.amount || 0);
      const paid = Number(i.paid_amount || 0);
      const bal = i.balance_amount !== undefined ? Number(i.balance_amount) : Math.max(0, total - paid);
      return sum + bal;
    }, 0);

  const totalDue = items
    .filter((i) => i.status === "DUE")
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const agentCount = new Set(items.map((i) => i.agent_name).filter(Boolean)).size;

  // Filtered Items
  const filtered = items.filter((item) => {
    if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
    if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchAgent = (item.agent_name || "").toLowerCase().includes(q);
      const matchCustomer = (item.customer_name || "").toLowerCase().includes(q);
      const matchRef = (item.quote_no || item.deal_title || item.reference_id || "").toLowerCase().includes(q);
      if (!matchAgent && !matchCustomer && !matchRef) return false;
    }
    return true;
  });

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Agent Commissions & Referrals</h1>
          <p className={styles.subtitle}>
            Track lead sourcing charges, closed deal commissions, and disburse payments with bank UTR numbers.
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Ready for Payout (Won Deals)</span>
          <span className={styles.metricValue} style={{ color: "#047857" }}>
            ₹ {totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Total Disbursed (Paid)</span>
          <span className={styles.metricValue} style={{ color: "#475569" }}>
            ₹ {totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Pending Leads (In Pipeline)</span>
          <span className={styles.metricValue} style={{ color: "#b45309" }}>
            ₹ {totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Total Active Agents</span>
          <span className={styles.metricValue}>{agentCount}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.search}>
            <SearchIcon />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search agent, customer, ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="PAYABLE">Payable (Ready to pay)</option>
            <option value="DUE">Due (Lead in pipeline)</option>
            <option value="PAID">Paid (Disbursed)</option>
          </select>

          <select
            className={styles.select}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All Types</option>
            <option value="COMMISSION">Deal Commission</option>
            <option value="LEAD_FEE">Lead Sourcing Fee</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No commission records found"
          body={
            search || statusFilter !== "ALL" || typeFilter !== "ALL"
              ? "No agent records match the current filters."
              : "When you add an Agent / Referrer to an Enquiry or Quotation, their commission ledger will appear here."
          }
        />
      ) : (
        <>
          <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Agent Name</th>
                <th className={styles.th}>Customer / Reference</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Total Commission</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Paid So Far</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Balance Due</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Installments & Proofs</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const total = Number(item.amount || 0);
                const paid = Number(item.paid_amount || 0);
                const balance = item.balance_amount !== undefined ? Number(item.balance_amount) : Math.max(0, total - paid);
                const installmentsCount = item.payouts?.length || 0;

                return (
                  <tr key={`${item.type}-${item.id}`}>
                    <td className={styles.td}>
                      {item.type === "COMMISSION" ? (
                        <span className={`${styles.badge} ${styles.badgeCommission}`}>Deal Commission</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeLeadFee}`}>Lead Sourcing Fee</span>
                      )}
                    </td>
                    <td className={styles.td} style={{ fontWeight: 600 }}>
                      {item.agent_name || "—"}
                    </td>
                    <td className={styles.td}>
                      <div>{item.customer_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-3, #64748b)" }}>
                        {item.quote_no || item.deal_title || item.reference_id}
                      </div>
                    </td>
                    <td className={styles.td} style={{ textAlign: "right", fontWeight: 700 }}>
                      ₹ {total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className={styles.td} style={{ textAlign: "right", fontWeight: 600, color: "#047857" }}>
                      ₹ {paid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className={styles.td} style={{ textAlign: "right", fontWeight: 700, color: balance > 0 ? "#b45309" : "#64748b" }}>
                      ₹ {balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className={styles.td}>
                      {item.status === "PARTIALLY_PAID" && (
                        <span className={`${styles.badge}`} style={{ background: "#fef3c7", color: "#92400e" }}>
                          ● Partial ({installmentsCount} inst.)
                        </span>
                      )}
                      {item.status === "PAYABLE" && (
                        <span className={`${styles.badge} ${styles.badgeStatusPayable}`}>● Payable</span>
                      )}
                      {item.status === "DUE" && (
                        <span className={`${styles.badge} ${styles.badgeStatusDue}`}>● Due</span>
                      )}
                      {item.status === "PAID" && (
                        <span className={`${styles.badge} ${styles.badgeStatusPaid}`}>✓ Fully Paid</span>
                      )}
                    </td>
                    <td className={styles.td}>
                      {installmentsCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPayment(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#2563eb",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            padding: 0,
                          }}
                        >
                          {installmentsCount} installment{installmentsCount > 1 ? "s" : ""} (view proofs)
                        </button>
                      ) : (
                        <span style={{ color: "var(--color-text-3, #94a3b8)", fontSize: "0.8rem" }}>No installments</span>
                      )}
                    </td>
                    <td className={styles.td} style={{ textAlign: "right" }}>
                      {item.status !== "PAID" ? (
                        <button
                          type="button"
                          className={styles.recordBtn}
                          onClick={() => handleOpenPayment(item)}
                        >
                          {item.status === "PARTIALLY_PAID" ? "Pay Next Installment" : "Record Payout"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPayment(item)}
                          className={styles.btnSecondary}
                          style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View Card List (Screens <= 768px) */}
        <div className={styles.mobileCardList}>
          {filtered.map((item) => {
            const total = Number(item.amount || 0);
            const paid = Number(item.paid_amount || 0);
            const balance = item.balance_amount !== undefined ? Number(item.balance_amount) : Math.max(0, total - paid);
            const installmentsCount = item.payouts?.length || 0;

            return (
              <div key={`m-${item.type}-${item.id}`} className={styles.mobileCard}>
                <div className={styles.mobileCardHeader}>
                  <div className={styles.mobileAgentName}>
                    👤 {item.agent_name || "Unknown Agent"}
                  </div>
                  {item.type === "COMMISSION" ? (
                    <span className={`${styles.badge} ${styles.badgeCommission}`}>Deal Commission</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeLeadFee}`}>Lead Fee</span>
                  )}
                </div>

                <div className={styles.mobileCustomerInfo}>
                  <strong>{item.customer_name}</strong>
                  <span className={styles.mobileRef}>{item.quote_no || item.deal_title || item.reference_id}</span>
                </div>

                <div className={styles.mobileFinancialGrid}>
                  <div className={styles.mobileFinancialItem}>
                    <span className={styles.mobileFinancialLabel}>Total</span>
                    <span className={styles.mobileFinancialValue}>₹{total.toLocaleString("en-IN")}</span>
                  </div>
                  <div className={styles.mobileFinancialItem}>
                    <span className={styles.mobileFinancialLabel}>Paid</span>
                    <span className={styles.mobileFinancialValue} style={{ color: "#047857" }}>
                      ₹{paid.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className={styles.mobileFinancialItem}>
                    <span className={styles.mobileFinancialLabel}>Balance</span>
                    <span className={styles.mobileFinancialValue} style={{ color: balance > 0 ? "#b45309" : "#64748b" }}>
                      ₹{balance.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                <div className={styles.mobileCardFooter}>
                  <div className={styles.mobileCardFooterRow}>
                    <span>
                      {item.status === "PARTIALLY_PAID" && (
                        <span className={styles.badge} style={{ background: "#fef3c7", color: "#92400e" }}>
                          ● Partial ({installmentsCount} inst.)
                        </span>
                      )}
                      {item.status === "PAYABLE" && (
                        <span className={`${styles.badge} ${styles.badgeStatusPayable}`}>● Payable</span>
                      )}
                      {item.status === "DUE" && (
                        <span className={`${styles.badge} ${styles.badgeStatusDue}`}>● Due</span>
                      )}
                      {item.status === "PAID" && (
                        <span className={`${styles.badge} ${styles.badgeStatusPaid}`}>✓ Fully Paid</span>
                      )}
                    </span>
                    {installmentsCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleOpenPayment(item)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#2563eb",
                          textDecoration: "underline",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          padding: 0,
                        }}
                      >
                        {installmentsCount} proof{installmentsCount > 1 ? "s" : ""}
                      </button>
                    ) : (
                      <span style={{ color: "var(--color-text-3, #94a3b8)", fontSize: "0.78rem" }}>No proofs yet</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`${styles.recordBtn} ${styles.mobileActionBtn}`}
                    onClick={() => handleOpenPayment(item)}
                  >
                    {item.status === "PARTIALLY_PAID"
                      ? "Pay Next Installment"
                      : item.status === "PAID"
                      ? "View Details & Proofs"
                      : "Record Payout"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Record / Installments Payout Modal */}
      <RecordPayoutModal
        open={payingRecord !== null}
        onClose={handleClosePayment}
        record={payingRecord}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

