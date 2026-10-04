import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { useSites } from "../hooks/useSiteServices";
import { useConfirmAmcQuote } from "../../sales/hooks/useEnquiries";
import { QuoteBuilderDialog } from "../../sales/components/QuoteBuilderDialog";
import { AmcRow } from "../components/AmcRow";
import styles from "./AMCScreen.module.css";

export function AMCScreen() {
  const confirmQuoteMutation = useConfirmAmcQuote();
  const { data: sites, isPending, isError, error } = useSites();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // Quote Builder State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [editingEnquiryId, setEditingEnquiryId] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState("");

  if (isPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  // Sites are already confirmed sites by definition of the backend
  const displaySites = selectedSiteId
    ? (sites || []).filter((s) => s.id === selectedSiteId)
    : (sites || []);

  const handleOpenQuoteModal = (enquiryId: string, quoteId?: string) => {
    setEditingEnquiryId(enquiryId);
    setEditingQuoteId(quoteId || "");
    setIsQuoteModalOpen(true);
  };

  const handleConfirmQuote = async (enquiryId: string, quoteId: string) => {
    if (!window.confirm("Are you sure you want to confirm this AMC quote? This will set it as the Active AMC for this site.")) return;
    try {
      await confirmQuoteMutation.mutateAsync({ enquiryId, quoteId });
      alert("AMC Quote confirmed! Site Service Profile updated.");
      setIsQuoteModalOpen(false);
    } catch (e: any) {
      alert(`Failed to confirm quote: ${e.message}`);
    }
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
          <option value="">All Deployed Sites ({sites?.length || 0})</option>
          {(sites || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.customer_name} ({s.oc_number || "No OC"})
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => {
            const site = sites?.find((s) => s.id === selectedSiteId) || sites?.[0];
            if (site) handleOpenQuoteModal(site.enquiry_id);
          }}
          disabled={!sites?.length}
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
                    site={site as any} // AmcRow expects type Site that has enquiry fields, need to cast or adapt AmcRow
                    amcQuotes={amcQuotes}
                    latestQuote={latestQuote}
                    activeQuote={activeQuote}
                    isExpanded={expandedRowId === site.id}
                    onToggle={() => setExpandedRowId(expandedRowId === site.id ? null : site.id)}
                    onNewQuote={() => handleOpenQuoteModal(site.enquiry_id)}
                    onEditQuote={(quoteId) => handleOpenQuoteModal(site.enquiry_id, quoteId)}
                    onConfirmQuote={(quoteId) => handleConfirmQuote(site.enquiry_id, quoteId)}
                    onDeleteQuote={(quoteId) => handleDeleteQuote(site.enquiry_id, quoteId)}
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
