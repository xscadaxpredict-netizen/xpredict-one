import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSites } from "../hooks/useSiteServices";
import { useConfirmAmcQuote, useAddFollowup, useUpdateFollowup, useDeleteFollowup } from "../../sales/hooks/useEnquiries";
import type { NewFollowup, Followup } from "../../sales/api/types";
import { QuoteBuilderDialog } from "../../sales/components/QuoteBuilderDialog";
import { FollowupDialog } from "../../sales/components/FollowupDialog";
import { AmcRow } from "../components/AmcRow";
import styles from "./AMCScreen.module.css";
import { useDialog } from "../../shared/hooks/useDialog";

export function AMCScreen() {
  const queryClient = useQueryClient();
  const confirmQuoteMutation = useConfirmAmcQuote();
  const addFollowup = useAddFollowup();
  const { data: sites, isPending, isError, error } = useSites();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // Quote Builder State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [editingEnquiryId, setEditingEnquiryId] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState("");

  // Follow-up State
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);
  const [followupEnquiryId, setFollowupEnquiryId] = useState("");
  const [editingFollowup, setEditingFollowup] = useState<{ enquiryId: string; followup: Followup } | null>(null);
  const updateFollowup = useUpdateFollowup();
  const deleteFollowup = useDeleteFollowup();
  
  const { showAlert, showConfirm, DialogComponent } = useDialog();

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

  const handleOpenFollowupModal = (enquiryId: string) => {
    setFollowupEnquiryId(enquiryId);
    setIsFollowupModalOpen(true);
  };

  const handleAddFollowup = (body: NewFollowup) => {
    if (!followupEnquiryId) return;
    addFollowup.mutate(
      { enquiryId: followupEnquiryId, body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["site-services"] });
          setIsFollowupModalOpen(false);
          setFollowupEnquiryId("");
          showAlert("Success", "Follow-up added successfully!");
        },
      }
    );
  };

  const handleEditFollowupSubmit = (body: NewFollowup) => {
    if (!editingFollowup) return;
    updateFollowup.mutate(
      { enquiryId: editingFollowup.enquiryId, followupId: editingFollowup.followup.id, body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["site-services"] });
          setEditingFollowup(null);
          showAlert("Success", "Follow-up updated successfully!");
        },
      }
    );
  };

  const handleDeleteFollowup = async (enquiryId: string, followupId: string) => {
    if (!(await showConfirm("Delete Follow-up", "Are you sure you want to delete this follow-up entry?"))) return;
    deleteFollowup.mutate(
      { enquiryId, followupId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["site-services"] });
          showAlert("Success", "Follow-up deleted successfully!");
        },
      }
    );
  };

  const handleConfirmQuote = async (enquiryId: string, quoteId: string) => {
    if (!(await showConfirm("Confirm Quote", "Are you sure you want to confirm this AMC quote? This will set it as the Active AMC for this site."))) return;
    try {
      await confirmQuoteMutation.mutateAsync({ enquiryId, quoteId });
      showAlert("Success", "AMC Quote confirmed! Site Service Profile updated.");
      setIsQuoteModalOpen(false);
    } catch (e: any) {
      showAlert("Error", `Failed to confirm quote: ${e.message}`);
    }
  };

  const handleDeleteQuote = async (_enquiryId: string, _quoteId: string) => {
    if (!(await showConfirm("Delete Quote", "Are you sure you want to delete this quote? This action cannot be undone."))) return;
    showAlert("Info", "In a real app, this would call deleteQuote(quoteId)");
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
                    onAddFollowup={() => handleOpenFollowupModal(site.enquiry_id)}
                    onEditFollowup={(f) => setEditingFollowup({ enquiryId: site.enquiry_id, followup: f })}
                    onDeleteFollowup={(id) => handleDeleteFollowup(site.enquiry_id, id)}
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

      {isFollowupModalOpen && (
        <FollowupDialog
          open={isFollowupModalOpen}
          onClose={() => setIsFollowupModalOpen(false)}
          onSubmit={handleAddFollowup}
          isPending={addFollowup.isPending}
        />
      )}

      {editingFollowup && (
        <FollowupDialog
          open={true}
          onClose={() => setEditingFollowup(null)}
          onSubmit={handleEditFollowupSubmit}
          isPending={updateFollowup.isPending}
          initialData={editingFollowup.followup}
        />
      )}
      <DialogComponent />
    </div>
  );
}
