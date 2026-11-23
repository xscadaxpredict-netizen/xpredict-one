import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSites } from "../hooks/useSiteServices";
import { useConfirmAmcQuote, useAddFollowup, useUpdateFollowup, useDeleteFollowup, useDeleteQuotation, useQuotationDependencies } from "../../sales/hooks/useEnquiries";
import { planQuotationDelete } from "../../shared/deleteChecks";
import type { NewFollowup, Followup } from "../../sales/api/types";
import { QuoteBuilderDialog } from "../../sales/components/QuoteBuilderDialog";
import { SiteSearchSelect } from "../components/SiteSearchSelect";
import { QuotationPreviewDialog } from "../../sales/components/QuotationPreviewDialog";
import { FollowupDialog } from "../../sales/components/FollowupDialog";
import { AmcRow } from "../components/AmcRow";
import styles from "./AMCScreen.module.css";
import { useDialog } from "../../shared/hooks/useDialog";

export function AMCScreen() {
  const queryClient = useQueryClient();
  const confirmQuoteMutation = useConfirmAmcQuote();
  const addFollowup = useAddFollowup();
  const deleteQuotation = useDeleteQuotation();
  const quotationDependencies = useQuotationDependencies();
  const { data: sites, isPending, isError, error } = useSites();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // Quote Builder State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [editingEnquiryId, setEditingEnquiryId] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState("");
  const [viewingQuote, setViewingQuote] = useState<{
    enquiry: any;
    quote: import("../../sales/api/types").Quotation;
  } | null>(null);

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
        },
      }
    );
  };

  const handleConfirmQuote = async (enquiryId: string, quoteId: string) => {
    if (!(await showConfirm("Confirm Quote", "Are you sure you want to confirm this AMC quote? This will set it as the Active AMC for this site."))) return;
    try {
      await confirmQuoteMutation.mutateAsync({ enquiryId, quoteId });
      queryClient.invalidateQueries({ queryKey: ["site-services"] });
      setIsQuoteModalOpen(false);
    } catch (e: any) {
      showAlert("Error", `Failed to confirm quote: ${e.message}`);
    }
  };

  const handleDeleteQuote = async (enquiryId: string, quoteId: string) => {
    // Ask the backend what depends on this quote (visits, active AMC, documents)
    // and say so in the dialog, instead of a generic "are you sure".
    let plan;
    try {
      plan = planQuotationDelete(await quotationDependencies.mutateAsync({ enquiryId, quoteId }));
    } catch (err: any) {
      void showAlert("Error", "Could not check this quote before deleting: " + (err?.message || err));
      return;
    }
    if (plan.blocked) {
      void showAlert("Cannot delete quote", plan.blocked);
      return;
    }
    if (!(await showConfirm("Delete Quote", plan.message))) return;
    deleteQuotation.mutate(
      { enquiryId, quoteId, confirm: plan.confirm },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["site-services"] });
        },
        onError: (err: any) => {
          showAlert("Error", "Failed to delete quote: " + (err?.message || err));
        },
      }
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.actionBar}>
        <SiteSearchSelect sites={sites || []} value={selectedSiteId} onChange={setSelectedSiteId} />

        {/* AN AMC IS FOR ONE SITE: the button appears once a site is chosen. */}
        {selectedSiteId && (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              const site = sites?.find((s) => s.id === selectedSiteId);
              if (site) handleOpenQuoteModal(site.enquiry_id);
            }}
          >
            <ShieldCheckIcon size={16} /> Create AMC Quote
          </button>
        )}
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
                    onViewQuote={(q) => setViewingQuote({ enquiry: site, quote: q })}
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

      {viewingQuote && (
        <QuotationPreviewDialog
          open={Boolean(viewingQuote)}
          onClose={() => setViewingQuote(null)}
          enquiry={viewingQuote.enquiry}
          quotation={viewingQuote.quote}
          onEdit={() => {
            const current = viewingQuote;
            setViewingQuote(null);
            handleOpenQuoteModal(current.enquiry.enquiry_id, current.quote.id);
          }}
        />
      )}

      {isQuoteModalOpen && (
        <QuoteBuilderDialog
          open={isQuoteModalOpen}
          onClose={() => setIsQuoteModalOpen(false)}
          enquiryId={editingEnquiryId}
          existingQuoteId={editingQuoteId || undefined}
          allowedTypes={["AMC"]}
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
