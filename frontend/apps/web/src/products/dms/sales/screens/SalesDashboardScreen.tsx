import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TagIcon,
  CheckCircle2Icon,
  ClockIcon,
  TrendingUpIcon,
  AlertCircleIcon,
  FileTextIcon,
  PhoneCallIcon,
  ArrowRightIcon,
  PlusIcon,
  CheckSquareIcon,
} from "lucide-react";
import { useEnquiries } from "../hooks/useEnquiries";
import styles from "./SalesDashboardScreen.module.css";

export function SalesDashboardScreen() {
  const navigate = useNavigate();
  const { data: enquiries = [], isPending, isError, error } = useEnquiries();

  // Metrics computation
  const metrics = useMemo(() => {
    const total = enquiries.length;
    const pending = enquiries.filter((e) => e.status === "PENDING").length;
    const confirmed = enquiries.filter((e) => e.status === "CONFIRMED").length;
    const lost = enquiries.filter((e) => e.status === "LOST").length;
    const conversionRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : "0.0";

    // Quotations metrics
    let totalQuotesCount = 0;
    let draftQuotes = 0;
    let sentQuotes = 0;
    let confirmedQuotes = 0;
    let rejectedQuotes = 0;
    let pipelineValue = 0;
    let bookedRevenue = 0;

    // Followups due
    const todayStr = new Date().toISOString().slice(0, 10);
    const urgentFollowups: Array<{
      enquiryId: string;
      customerName: string;
      phone: string;
      date: string;
      remarks: string;
      isOverdue: boolean;
    }> = [];

    enquiries.forEach((enquiry) => {
      // Followups
      if (enquiry.status === "PENDING" && enquiry.followups && enquiry.followups.length > 0) {
        enquiry.followups.forEach((fu) => {
          if (fu.next_followup_date) {
            const isOverdue = fu.next_followup_date < todayStr;
            const isToday = fu.next_followup_date === todayStr;
            if (isOverdue || isToday) {
              urgentFollowups.push({
                enquiryId: enquiry.id,
                customerName: enquiry.customer_name,
                phone: enquiry.phone || "No phone",
                date: fu.next_followup_date,
                remarks: fu.remarks || "Follow-up scheduled",
                isOverdue,
              });
            }
          }
        });
      }

      // Quotations
      if (enquiry.quotes) {
        enquiry.quotes.forEach((quote) => {
          totalQuotesCount += 1;
          if (quote.status === "DRAFT") draftQuotes += 1;
          else if (quote.status === "QUOTE_SENT") sentQuotes += 1;
          else if (quote.status === "CONFIRMED") confirmedQuotes += 1;
          else if (quote.status === "REJECTED" || quote.status === "EXPIRED") rejectedQuotes += 1;

          // Estimate quote amount
          const quoteTotal = Number(quote.amount) || (quote.items ? quote.items.reduce((sum: number, item) => sum + (Number(item.base_price || 0) * (Number(item.quantity) || 1)), 0) : 0);

          if (quote.status === "CONFIRMED") {
            bookedRevenue += quoteTotal;
          } else if (quote.status !== "REJECTED" && quote.status !== "EXPIRED") {
            pipelineValue += quoteTotal;
          }
        });
      }
    });

    // Sort urgent followups (overdue first)
    urgentFollowups.sort((a, b) => a.date.localeCompare(b.date));

    // Sort recent enquiries
    const recent = [...enquiries]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    return {
      total,
      pending,
      confirmed,
      lost,
      conversionRate,
      totalQuotesCount,
      draftQuotes,
      sentQuotes,
      confirmedQuotes,
      rejectedQuotes,
      pipelineValue,
      bookedRevenue,
      urgentFollowups: urgentFollowups.slice(0, 5),
      recent,
    };
  }, [enquiries]);

  if (isPending) {
    return <div style={{ padding: "var(--space-6)" }}>Loading Sales Dashboard...</div>;
  }

  if (isError) {
    return (
      <div style={{ padding: "var(--space-6)", color: "var(--color-danger)" }}>
        Error loading sales metrics: {(error as Error).message}
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return "₹" + val.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  };

  return (
    <div className={styles.container}>
      {/* Top Header & Actions */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2>Sales Dashboard & Pipeline Overview</h2>
          <p>Real-time analytics for enquiries, quotations, conversions, and customer follow-ups.</p>
        </div>
        <div className={styles.actionButtons}>
          <Link to="../enquiries" className={styles.secondaryBtn}>
            <TagIcon size={15} /> All Enquiries
          </Link>
          <Link to="../orders" className={styles.secondaryBtn}>
            <CheckSquareIcon size={15} /> Confirmed Orders
          </Link>
          <button onClick={() => navigate("../enquiries")} className={styles.primaryBtn}>
            <PlusIcon size={15} /> New Enquiry
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Total Enquiries */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Total Enquiries</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconBlue}`}>
              <TagIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.total}</div>
          <div className={styles.kpiFooter}>
            <span className={`${styles.kpiBadge} ${styles.badgePending}`}>{metrics.pending} Pending</span>
            <span className={`${styles.kpiBadge} ${styles.badgeSuccess}`}>{metrics.confirmed} Confirmed</span>
            {metrics.lost > 0 && (
              <span className={`${styles.kpiBadge} ${styles.badgeLost}`}>{metrics.lost} Lost</span>
            )}
          </div>
        </div>

        {/* Card 2: Quotations Generated */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Quotations Generated</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconPurple}`}>
              <FileTextIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.totalQuotesCount}</div>
          <div className={styles.kpiFooter}>
            <span>{metrics.sentQuotes} Sent</span>
            <span>•</span>
            <span>{metrics.draftQuotes} Drafts</span>
            <span>•</span>
            <span>{metrics.confirmedQuotes} Won</span>
          </div>
        </div>

        {/* Card 3: Confirmed Deals & Revenue */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Confirmed Orders</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconGreen}`}>
              <CheckCircle2Icon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.confirmed}</div>
          <div className={styles.kpiFooter}>
            <span style={{ fontWeight: 600, color: "var(--color-success)" }}>
              {metrics.bookedRevenue > 0 ? formatCurrency(metrics.bookedRevenue) : "Active Orders Booked"}
            </span>
          </div>
        </div>

        {/* Card 4: Conversion Rate */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Conversion Rate</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconAmber}`}>
              <TrendingUpIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.conversionRate}%</div>
          <div className={styles.kpiFooter}>
            <span>{metrics.confirmed} won of {metrics.total} total leads</span>
          </div>
        </div>
      </div>

      {/* Two-Column Layout: Urgent Followups & Source Analytics */}
      <div className={styles.dualGrid}>
        {/* Left: Urgent Follow-ups */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <AlertCircleIcon size={18} color="var(--color-attention)" />
              Follow-ups Due & Overdue
            </div>
            <Link to="../enquiries" className={styles.panelAction}>
              View All <ArrowRightIcon size={12} style={{ display: "inline" }} />
            </Link>
          </div>

          {metrics.urgentFollowups.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2Icon size={28} color="var(--color-success)" style={{ margin: "0 auto 8px auto", display: "block" }} />
              No pending follow-ups due today. You are all caught up!
            </div>
          ) : (
            <div className={styles.followupList}>
              {metrics.urgentFollowups.map((fu, idx) => (
                <div
                  key={idx}
                  className={`${styles.followupItem} ${fu.isOverdue ? styles.followupItemOverdue : ""}`}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.followupCustName}>{fu.customerName}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-3)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <PhoneCallIcon size={12} /> {fu.phone}
                    </div>
                    <div className={styles.followupRemarks}>{fu.remarks}</div>
                  </div>
                  <div>
                    <span className={`${styles.followupDateBadge} ${fu.isOverdue ? styles.followupDateBadgeOverdue : ""}`}>
                      {fu.isOverdue ? "Overdue: " : "Due: "}
                      {fu.date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Lead Sources & Quotation Breakdown */}
        {/* Right: Quotation Pipeline Status */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <FileTextIcon size={18} color="var(--color-primary)" />
              Quotation Pipeline & Status
            </div>
            <Link to="../quotations" className={styles.panelAction}>
              All Quotations <ArrowRightIcon size={12} style={{ display: "inline" }} />
            </Link>
          </div>

          <div className={styles.statusChips}>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#2563eb" }}>{metrics.sentQuotes}</div>
              <div className={styles.statusChipLabel}>Sent</div>
            </div>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#059669" }}>{metrics.confirmedQuotes}</div>
              <div className={styles.statusChipLabel}>Confirmed</div>
            </div>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#d97706" }}>{metrics.draftQuotes}</div>
              <div className={styles.statusChipLabel}>Drafts</div>
            </div>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#b3261e" }}>{metrics.rejectedQuotes}</div>
              <div className={styles.statusChipLabel}>Rejected</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: "var(--space-2)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--color-text-2)" }}>Active Pipeline Value:</span>
              <span style={{ fontWeight: 700, color: "var(--color-primary)", fontSize: "1.1rem" }}>
                {formatCurrency(metrics.pipelineValue)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--color-text-2)" }}>Confirmed Orders Booked:</span>
              <span style={{ fontWeight: 700, color: "var(--color-success)", fontSize: "1.1rem" }}>
                {formatCurrency(metrics.bookedRevenue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Enquiries */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <ClockIcon size={18} color="var(--color-text-2)" />
            Recent Enquiries
          </div>
          <Link to="../enquiries" className={styles.panelAction}>
            View All Enquiries <ArrowRightIcon size={12} style={{ display: "inline" }} />
          </Link>
        </div>

        {metrics.recent.length === 0 ? (
          <div className={styles.emptyState}>No enquiries recorded yet.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Quotations</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recent.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.customer_name}</td>
                    <td>{e.contact_person || "—"}</td>
                    <td>{e.phone || "—"}</td>
                    <td>
                      <span
                        className={`${styles.kpiBadge} ${
                          e.status === "CONFIRMED"
                            ? styles.badgeSuccess
                            : e.status === "LOST"
                            ? styles.badgeLost
                            : styles.badgePending
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td>{e.quotes?.length || 0} quotes</td>
                    <td style={{ color: "var(--color-text-3)", fontSize: "var(--text-xs)" }}>
                      {new Date(e.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
