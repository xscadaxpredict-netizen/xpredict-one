/**
 * Enquiry list — the reference screen. Copy this structure.
 *
 * A screen does four things and nothing else:
 *   1. read route/filter state
 *   2. call hooks
 *   3. decide which of the four states to render
 *   4. hand data to presentational components
 *
 * There is no business logic here and no `fetch`. If this file grows an `if`
 * about a business rule, that rule belongs in the backend — the frontend is
 * not where invariants are enforced.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import { usePermission } from "@xpredict/auth";

import type { EnquiryFilters } from "../api/types";
import { useEnquiries } from "../hooks/useEnquiries";
import { EnquiryTable } from "../components/EnquiryTable";
import { EmptyState, EnquiryTableSkeleton, ErrorState } from "../components/states";
import styles from "./EnquiryListScreen.module.css";

export function EnquiryListScreen() {
  const [filters, setFilters] = useState<EnquiryFilters>({});
  const { data, isPending, isError, error, refetch } = useEnquiries(filters);

  const canCreate = usePermission("dms", "sales.enquiry.create");
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Enquiries</h1>
          <p className={styles.subtitle}>
            Walk-in, call and web enquiries for your dealership
          </p>
        </div>
        {canCreate && (
          <button type="button" className={styles.primaryAction}>
            New enquiry
          </button>
        )}
      </header>

      <FilterBar filters={filters} onChange={setFilters} />

      {/*
        The four states, in the order they are reached. Every list screen ships
        all four — see CONTRIBUTING.md section 8. Written afterwards they are
        always worse, and "nothing here yet" is a different screen from
        "nothing matched your filter": different message, different exit.
      */}
      {renderBody()}
    </div>
  );

  function renderBody() {
    // 1. Loading — a skeleton shaped like the table, not a centred spinner.
    //    A spinner throws every row down the page the moment data lands.
    if (isPending) {
      return <EnquiryTableSkeleton rows={8} />;
    }

    // 2. Error — message driven by `code`, never by `detail`, plus the
    //    trace_id so support can find the real error in the logs.
    if (isError) {
      const problem = asProblem(error);
      return (
        <ErrorState
          code={problem.code}
          traceId={problem.trace_id}
          onRetry={() => void refetch()}
        />
      );
    }

    // 3a. No results — the data exists, the filter is too narrow. The exit is
    //     to widen it. Never offer "New enquiry" here: that is how someone
    //     creates a duplicate of a record that was merely filtered out.
    if (data.results.length === 0 && hasActiveFilters) {
      return (
        <EmptyState
          title="No enquiries match these filters"
          body={`There are ${data.count} enquiries in total.`}
          actionLabel="Clear all filters"
          onAction={() => setFilters({})}
        />
      );
    }

    // 3b. Empty — nothing exists yet. Explain what will appear, and offer the
    //     action that creates the first one.
    if (data.results.length === 0) {
      return (
        <EmptyState
          title="No enquiries yet"
          body="When someone walks in, calls or submits the web form, the enquiry lands here."
          actionLabel={canCreate ? "New enquiry" : undefined}
        />
      );
    }

    // 4. Populated.
    return <EnquiryTable enquiries={data.results} total={data.count} />;
  }
}

interface FilterBarProps {
  filters: EnquiryFilters;
  onChange: (next: EnquiryFilters) => void;
}

function FilterBar({ filters, onChange }: FilterBarProps) {
  const statuses = ["new", "contacted", "quoted", "won", "lost"] as const;

  return (
    <div className={styles.filterBar}>
      <button
        type="button"
        className={styles.filterChip}
        aria-pressed={!filters.status}
        onClick={() => onChange({ ...filters, status: undefined })}
      >
        All
      </button>
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          className={styles.filterChip}
          aria-pressed={filters.status === status}
          onClick={() => onChange({ ...filters, status })}
        >
          {status}
        </button>
      ))}
    </div>
  );
}
