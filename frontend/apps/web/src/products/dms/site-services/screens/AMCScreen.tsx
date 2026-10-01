import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { useEnquiries } from "../../sales/hooks/useEnquiries";
import { QuoteBuilderDialog } from "../../sales/components/QuoteBuilderDialog";
import { AmcRow } from "../components/AmcRow";
import styles from "./AMCScreen.module.css";

export function AMCScreen() {
  const { data: enquiries, isPending, isError, error } = useEnquiries();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // Quote Builder State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [editingEnquiryId, setEditingEnquiryId] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState("");

  if (isPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  // Filter for confirmed sites
  const confirmedSites = (enquiries || []).filter((e) => e.status === "CONFIRMED");
  const displaySites = selectedSiteId
    ? confirmedSites.filter((s) => s.id === selectedSiteId)
    : confirmedSites;

  const handleOpenQuoteModal = (enquiryId: string, quoteId?: string) => {
    setEditingEnquiryId(enquiryId);
    setEditingQuoteId(quoteId || "");
    setIsQuoteModalOpen(true);
  };

  const handleConfirmQuote = (_enquiryId: string, _quoteId: string) => {
    if (!window.confirm("Are you sure you want to confirm this AMC quote? This will set it as the Active AMC for this site.")) return;
    alert("In a real app, this would call confirmAmcQuote(quoteId)");
  };

  const handleDeleteQuote = (_enquiryId: string, _quoteId: string) => {
    if (!window.confirm("Are you sure you want to delete this quote? This action cannot be undone.")) return;
    alert("In a real app, this would call deleteQuote(quoteId)");
  };

  return (
    <div className={styles.container}>
      <div className={styles.actionBar}>
        <select
          className={styles.siteSelect}
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
        >
          <option value="">All Deployed Sites ({confirmedSites.length})</option>
          {confirmedSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.customer_name} ({s.oc_number || "No OC"})
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => handleOpenQuoteModal(selectedSiteId || confirmedSites[0]?.id || "")}
          disabled={confirmedSites.length === 0}
        >
          <ShieldCheckIcon size={16} /> Create AMC Quote
        </button>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Customer</th>
              <th className={styles.th}>Machine (OC)</th>
              <th className={styles.th}>Latest Quotation</th>
              <th className={styles.th}>Active AMC</th>
              <th className={styles.thRight}>Action</th>
            </tr>
          </thead>
          <tbody>
            {displaySites.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  <ShieldCheckIcon size={36} className={styles.emptyIcon} />
                  <div>No AMC records found</div>
                </td>
              </tr>
            ) : (
              displaySites.map((site) => {
                const amcQuotes = site.quotes.filter((q) => q.type === "AMC").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const activeQuote = amcQuotes.find((q) => q.status === "CONFIRMED");
                const latestQuote = amcQuotes[0];

                return (
                  <AmcRow
                    key={site.id}
                    site={site}
                    amcQuotes={amcQuotes}
                    latestQuote={latestQuote}
                    activeQuote={activeQuote}
                    isExpanded={expandedRowId === site.id}
                    onToggle={() => setExpandedRowId(expandedRowId === site.id ? null : site.id)}
                    onNewQuote={() => handleOpenQuoteModal(site.id)}
                    onEditQuote={(quoteId) => handleOpenQuoteModal(site.id, quoteId)}
                    onConfirmQuote={(quoteId) => handleConfirmQuote(site.id, quoteId)}
                    onDeleteQuote={(quoteId) => handleDeleteQuote(site.id, quoteId)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isQuoteModalOpen && (
        <QuoteBuilderDialog
          open={isQuoteModalOpen}
          onClose={() => setIsQuoteModalOpen(false)}
          enquiryId={editingEnquiryId}
          existingQuoteId={editingQuoteId || undefined}
        />
      )}
    </div>
  );
}
