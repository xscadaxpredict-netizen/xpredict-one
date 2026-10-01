/**
 * Sales → Enquiry List Screen.
 *
 * The four states (loading, error, empty, no-results) as required by
 * CONTRIBUTING.md section 9. This is the main entry point for the Sales module.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, TableSkeleton } from "@xpredict/ui";

import {
  useAddFollowup,
  useConfirmOrder,
  useCreateEnquiry,
  useDeleteQuotation,
  useEnquiries,
} from "../hooks/useEnquiries";
import { EnquiryTable } from "../components/EnquiryTable";
import { NewEnquiryDialog } from "../components/NewEnquiryDialog";
import { FollowupDialog } from "../components/FollowupDialog";
import { QuoteBuilderDialog } from "../components/QuoteBuilderDialog";
import type { NewEnquiry, NewFollowup } from "../api/types";
import styles from "./EnquiryListScreen.module.css";

export function EnquiryListScreen() {
  const { data: enquiries, isPending, isError, error, refetch } = useEnquiries();
  const [searchQuery, setSearchQuery] = useState("");

  // ---- Dialog state --------------------------------------------------------
  const [isNewEnquiryOpen, setIsNewEnquiryOpen] = useState(false);
  const [followupEnquiryId, setFollowupEnquiryId] = useState<string | null>(null);

  // ---- Mutations -----------------------------------------------------------
  const createEnquiry = useCreateEnquiry();
  const addFollowup = useAddFollowup();
  const confirmOrder = useConfirmOrder();
  const deleteQuotation = useDeleteQuotation();

  const [editingQuote, setEditingQuote] = useState<{
    enquiryId: string;
    quoteId?: string;
  } | null>(null);

  // ---- Filtering -----------------------------------------------------------
  const filtered = enquiries?.filter((enq) =>
    matches(enq.customer_name, enq.contact_person, searchQuery),
  );

  // ---- Handlers ------------------------------------------------------------
  const handleCreateEnquiry = (body: NewEnquiry) => {
    createEnquiry.mutate(body, {
      onSuccess: () => setIsNewEnquiryOpen(false),
    });
  };

  const handleAddFollowup = (body: NewFollowup) => {
    if (!followupEnquiryId) return;
    addFollowup.mutate(
      { enquiryId: followupEnquiryId, body },
      { onSuccess: () => setFollowupEnquiryId(null) },
    );
  };

  const handleConfirmOrder = (enquiryId: string, quoteId: string) => {
    if (!window.confirm("Are you sure you want to confirm this order? This will mark the enquiry as WON.")) return;
    confirmOrder.mutate({ enquiryId, quoteId });
  };

  const handleDeleteQuote = (enquiryId: string, quoteId: string) => {
    if (!window.confirm("Are you sure you want to delete this quote?")) return;
    deleteQuotation.mutate({ enquiryId, quoteId });
  };

  const handleCreateQuote = (enquiryId: string) => {
    setEditingQuote({ enquiryId });
  };

  const handleEditQuote = (enquiryId: string, quoteId: string) => {
    setEditingQuote({ enquiryId, quoteId });
  };

  return (
    <div className={styles.page}>
      {/* Page header */}
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Enquiries & Follow-ups</h1>
          <p className={styles.subtitle}>
            Manage customer enquiries and schedule follow-ups
          </p>
        </div>

        <div className={styles.headerActions}>
          {/* Search — only visible when there are items */}
          {enquiries && enquiries.length > 0 && (
            <label className={styles.search}>
              <span className={styles.srOnly}>Search enquiries</span>
              <SearchIcon />
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          )}

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setIsNewEnquiryOpen(true)}
          >
            <PlusCircleIcon /> New Enquiry
          </button>
        </div>
      </header>

      {/* ---- The four states ---- */}

      {isPending && (
        <TableSkeleton
          label="enquiries"
          columns={[200, 120, 200, 180, "grow"]}
          rows={4}
        />
      )}

      {isError && (
        <ErrorState
          title="Could not load enquiries"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {enquiries && enquiries.length === 0 && (
        <EmptyState
          title="No enquiries yet"
          body="Create your first enquiry to start tracking customers and follow-ups."
          action={
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setIsNewEnquiryOpen(true)}
            >
              <PlusCircleIcon /> New Enquiry
            </button>
          }
        />
      )}

      {filtered && filtered.length === 0 && enquiries && enquiries.length > 0 && (
        <EmptyState
          title="No enquiries match your search"
          body={`There are ${String(enquiries.length)} enquiries total.`}
          action={
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </button>
          }
        />
      )}

      {filtered && filtered.length > 0 && (
        <EnquiryTable
          enquiries={filtered}
          onAddFollowup={(id) => setFollowupEnquiryId(id)}
          onCreateQuote={handleCreateQuote}
          onEditQuote={handleEditQuote}
          onConfirmOrder={handleConfirmOrder}
          onDeleteQuote={handleDeleteQuote}
        />
      )}

      {/* ---- Dialogs ---- */}

      <NewEnquiryDialog
        open={isNewEnquiryOpen}
        onClose={() => setIsNewEnquiryOpen(false)}
        onSubmit={handleCreateEnquiry}
        isPending={createEnquiry.isPending}
      />

      <FollowupDialog
        open={followupEnquiryId !== null}
        onClose={() => setFollowupEnquiryId(null)}
        onSubmit={handleAddFollowup}
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
    </div>
  );
}

// ---- Helpers ----------------------------------------------------------------

function matches(customerName: string, contactPerson: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${customerName} ${contactPerson}`.toLowerCase().includes(needle);
}

// ---- Inline SVG icons -------------------------------------------------------

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
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
