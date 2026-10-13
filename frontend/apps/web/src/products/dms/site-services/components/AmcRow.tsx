import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, MapPinIcon, MessageSquareIcon, EyeIcon, Edit3Icon, Trash2Icon, CheckCircleIcon, PlusIcon } from "lucide-react";
import type { Enquiry, Quotation } from "../../sales/api/types";
import styles from "./AmcRow.module.css";

interface Props {
  site: Enquiry;
  amcQuotes: Quotation[];
  latestQuote?: Quotation;
  activeQuote?: Quotation;
  isExpanded: boolean;
  onToggle: () => void;
  onNewQuote: () => void;
  onEditQuote: (quoteId: string) => void;
  onConfirmQuote: (quoteId: string) => void;
  onDeleteQuote: (quoteId: string) => void;
  onAddFollowup: () => void;
  onEditFollowup?: (followup: any) => void;
  onDeleteFollowup?: (followupId: string) => void;
}

export function AmcRow({
  site,
  amcQuotes,
  latestQuote,
  activeQuote,
  isExpanded,
  onToggle,
  onNewQuote,
  onEditQuote,
  onConfirmQuote,
  onDeleteQuote,
  onAddFollowup,
  onEditFollowup,
  onDeleteFollowup,
}: Props) {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  return (
    <>
      <tr className={`${styles.row} ${isExpanded ? styles.rowExpanded : ""}`} onClick={onToggle}>
        <td className={styles.td}>
          <div className={styles.customerName}>{site.customer_name}</div>
          <div className={styles.customerContact}>{site.address || site.phone}</div>
        </td>
        <td className={styles.td}>
          <div className={styles.ocNumber}>{site.oc_number || "Pending OC"}</div>
        </td>
        <td className={styles.td}>
          {latestQuote ? (
            <div>
              <div className={styles.quoteTitle}>
                {latestQuote.title} ({latestQuote.id})
              </div>
              <div className={styles.quoteAmount}>
                ₹ {latestQuote.amount.toLocaleString("en-IN")}
              </div>
              <div className={styles.actions} style={{ justifyContent: "flex-start", marginTop: "4px" }}>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                  title="View Quote"
                  onClick={(e) => { e.stopPropagation(); onEditQuote(latestQuote.id); }}
                >
                  <EyeIcon size={14} />
                </button>
                {(latestQuote.status === "DRAFT" || latestQuote.status === "QUOTE_SENT") && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Edit Quote"
                    onClick={(e) => { e.stopPropagation(); onEditQuote(latestQuote.id); }}
                  >
                    <Edit3Icon size={14} />
                  </button>
                )}
                {latestQuote.status !== "CONFIRMED" && (
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete Quote"
                    onClick={(e) => { e.stopPropagation(); onDeleteQuote(latestQuote.id); }}
                  >
                    <Trash2Icon size={14} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <span className={styles.muted}>No quotes yet</span>
          )}
        </td>
        <td className={styles.td}>
          {activeQuote ? (
            <div>
              <div className={styles.activeAmcId}>{activeQuote.id}</div>
              <div className={styles.muted}>{activeQuote.amc_type}</div>
            </div>
          ) : (
            <span className={styles.muted}>None</span>
          )}
        </td>
        <td className={styles.tdRight}>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={(e) => { e.stopPropagation(); onNewQuote(); }}
            >
              New Quote
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={(e) => { e.stopPropagation(); onAddFollowup(); }}
            >
              <PlusIcon size={14} style={{ marginRight: '4px' }} /> Follow-up
            </button>
            <button type="button" className={styles.expandBtn}>
              {isExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded Details */}
      {isExpanded && (
        <tr>
          <td colSpan={5} className={styles.expandedCell}>
            <div className={styles.expandedContent}>
              <div className={styles.mobileActionsBar}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={(e) => { e.stopPropagation(); onNewQuote(); }}
                >
                  New Quote
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={(e) => { e.stopPropagation(); onAddFollowup(); }}
                >
                  <PlusIcon size={14} style={{ marginRight: '4px' }} /> Follow-up
                </button>
              </div>

              <div className={styles.detailGrid}>
                {/* Left: Site Info */}
                <div>
                  <h4 className={styles.sectionTitle}>Site Details</h4>
                  <div className={styles.infoRow}>
                    <MapPinIcon className={styles.infoIcon} size={15} />
                    <span>{site.address || "No Address Provided"}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <MessageSquareIcon className={styles.infoIcon} size={15} />
                    <span>{site.remarks || "No remarks."}</span>
                  </div>
                </div>

                {/* Middle: Follow-up history */}
                <div>
                  <h4 className={styles.sectionTitle}>Follow-up History</h4>
                  {site.followups && site.followups.length > 0 ? (
                    <div className={styles.quoteHistoryList}>
                      {/* Latest */}
                      <div className={styles.historyCard} style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.8rem", color: "var(--color-text-2)" }}>
                          <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
                            Due: {site.followups[0]!.next_followup_date}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>Added {site.followups[0]!.entered_date}</span>
                            {onEditFollowup && (
                              <button
                                type="button"
                                className={styles.iconBtnSm}
                                title="Edit Follow-up"
                                onClick={(e) => { e.stopPropagation(); onEditFollowup(site.followups[0]); }}
                                style={{ padding: "4px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-primary)" }}
                              >
                                <Edit3Icon size={12} />
                              </button>
                            )}
                            {onDeleteFollowup && (
                              <button
                                type="button"
                                className={styles.iconBtnSm}
                                title="Delete Follow-up"
                                onClick={(e) => { e.stopPropagation(); onDeleteFollowup(site.followups[0]!.id); }}
                                style={{ padding: "4px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-danger)" }}
                              >
                                <Trash2Icon size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-text)", whiteSpace: "pre-wrap" }}>
                          {site.followups[0]!.remarks}
                        </p>
                      </div>

                      {/* Older followups toggle */}
                      {site.followups.length > 1 && (
                        <div>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsHistoryExpanded(!isHistoryExpanded);
                            }}
                            style={{ margin: "4px 0", fontSize: "0.8rem", width: "100%", display: "flex", justifyContent: "space-between" }}
                          >
                            <span>
                              {isHistoryExpanded
                                ? "Hide past"
                                : `${String(site.followups.length - 1)} older follow-up${site.followups.length > 2 ? "s" : ""}`}
                            </span>
                            {isHistoryExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                          </button>

                          {isHistoryExpanded && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                              {site.followups.slice(1).map((f) => (
                                <div key={f.id} style={{ padding: "8px 0", borderTop: "1px dashed var(--color-border-strong)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--color-text-2)", marginBottom: "4px" }}>
                                    <span>Due: {f.next_followup_date}</span>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span>Added {f.entered_date}</span>
                                      {onEditFollowup && (
                                        <button
                                          type="button"
                                          className={styles.iconBtnSm}
                                          title="Edit Follow-up"
                                          onClick={(e) => { e.stopPropagation(); onEditFollowup(f); }}
                                          style={{ padding: "4px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-primary)" }}
                                        >
                                          <Edit3Icon size={12} />
                                        </button>
                                      )}
                                      {onDeleteFollowup && (
                                        <button
                                          type="button"
                                          className={styles.iconBtnSm}
                                          title="Delete Follow-up"
                                          onClick={(e) => { e.stopPropagation(); onDeleteFollowup(f.id); }}
                                          style={{ padding: "4px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-danger)" }}
                                        >
                                          <Trash2Icon size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-2)" }}>
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
                    <div className={styles.muted}>No follow-ups recorded yet.</div>
                  )}
                </div>

                {/* Right: Quotation History */}
                <div>
                  <h4 className={styles.sectionTitle}>Quotation History</h4>
                  {amcQuotes.length > 0 ? (
                    <div className={styles.quoteHistoryList}>
                      {amcQuotes.map((q) => (
                        <div
                          key={q.id}
                          className={`${styles.historyCard} ${
                            q.status === "CONFIRMED" ? styles.historyCardConfirmed : ""
                          }`}
                        >
                          <div>
                            <div className={styles.historyCardTitle}>
                              {q.id} - {q.title}
                            </div>
                            <div className={styles.historyCardMeta}>
                              {q.amc_type} • {q.service_interval} • ₹{q.amount.toLocaleString("en-IN")}
                            </div>
                            <div style={{ marginTop: "4px" }}>
                              <span
                                className={`${styles.statusBadge} ${
                                  q.status === "CONFIRMED" ? styles.statusBadgeSuccess : styles.statusBadgePending
                                }`}
                              >
                                {q.status}
                              </span>
                            </div>
                          </div>

                          <div className={styles.historyCardActions}>
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                              onClick={() => onEditQuote(q.id)}
                              title="View Quote"
                            >
                              <EyeIcon size={14} />
                            </button>
                            {(q.status === "DRAFT" || q.status === "QUOTE_SENT") && (
                              <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={() => onEditQuote(q.id)}
                                title="Edit Quote"
                              >
                                <Edit3Icon size={14} />
                              </button>
                            )}
                            {q.status !== "CONFIRMED" && (
                              <button
                                type="button"
                                className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                                onClick={() => onConfirmQuote(q.id)}
                                title="Confirm Quote"
                              >
                                <CheckCircleIcon size={14} />
                              </button>
                            )}
                            {q.status !== "CONFIRMED" && (
                              <button
                                type="button"
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                onClick={() => onDeleteQuote(q.id)}
                                title="Delete Quote"
                              >
                                <Trash2Icon size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.muted}>No quotations generated yet.</p>
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


