/**
 * Administration → Dealers. The organisation's dealerships.
 *
 * HERE RATHER THAN IN DMS, and that is C3 rather than a filing decision:
 * administration is two-level, the organisation opens and closes dealerships,
 * and each one then manages its own people. Putting this inside DMS would
 * mean a CRM-only organisation had nowhere to reach it, and would blur the
 * line the whole model rests on.
 *
 * Deliberately the same shape as Users — heading, list, detail panel driven
 * by the URL. Three developers are about to build more screens like this, and
 * a second layout for the second one is how a product starts looking like
 * several products.
 *
 * No search box, unlike Users. An organisation has a handful of dealerships
 * and hundreds of people; a filter over four rows is a control that costs
 * more attention than it saves.
 */

import { useNavigate, useParams } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { EmptyState, ErrorState, TableSkeleton } from "@xpredict/ui";

import { useShellContext } from "../../context";
import { CreateDealerDialog } from "../components/CreateDealerDialog";
import { DealerDetailPanel } from "../components/DealerDetailPanel";
import { DealerTable } from "../components/DealerTable";
import { useDealers } from "../hooks/useDealers";
import styles from "./DealersScreen.module.css";

export function DealersScreen() {
  const { membership } = useShellContext();
  const { data: dealers, isPending, isError, error, refetch } = useDealers();

  /*
   * The open dealership lives in the URL. Back closes the panel, a link to
   * one can be pasted into a message, and a refresh keeps it open — none of
   * which a `useState` would give.
   */
  const { dealerId } = useParams<{ dealerId: string }>();
  const navigate = useNavigate();
  const basePath = `/${membership.org_slug}/admin/dealers`;
  const usersPath = `/${membership.org_slug}/admin/users`;

  const selected = dealerId ? dealers?.find((dealer) => dealer.id === dealerId) : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Dealers</h1>
          <p className={styles.subtitle}>
            {/*
              The model, said once on the screen where it matters most. Anyone
              who has not met C5 will assume a dealership partitions the whole
              product, and then wonder why CRM is not filtered.
            */}
            Dealerships in {membership.org_name}. They divide DMS only — CRM and the rest
            are organisation-wide. Each dealership manages its own people.
          </p>
        </div>

        <CreateDealerDialog />
      </header>

      {dealers && dealers.length > 0 && (
        <div className={styles.toolbar}>
          <p className={styles.count}>
            {dealers.length === 1 ? "1 dealership" : `${String(dealers.length)} dealerships`}
            {", "}
            {String(dealers.filter((dealer) => dealer.status === "active").length)} open
          </p>
        </div>
      )}

      {isPending && <TableSkeleton label="dealers" columns={[280, 90, "grow"]} rows={4} />}

      {isError && (
        <ErrorState
          title="Could not load dealers"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      )}

      {dealers && dealers.length === 0 && (
        /*
         * Reachable, unlike the equivalent on Users: an organisation always
         * has an owner, but it may genuinely have no dealerships yet — a
         * single-site business, or one that has only just signed up.
         */
        <EmptyState
          title="No dealerships yet"
          body="Add one for each branch that needs its own people and its own DMS records. An organisation with a single site does not need any."
        />
      )}

      {dealers && dealers.length > 0 && (
        <div className={styles.layout} data-detail={selected ? true : undefined}>
          <DealerTable
            dealers={dealers}
            basePath={basePath}
            selectedId={selected?.id}
            onSelect={(id) => void navigate(`${basePath}/${id}`)}
          />

          {selected && (
            <DealerDetailPanel
              dealer={selected}
              usersPath={usersPath}
              onClose={() => void navigate(basePath)}
            />
          )}
        </div>
      )}

      {/*
        A URL naming a dealership that is not in the list: a stale link, or one
        removed since it was sent. Said plainly rather than silently dropping
        the panel, which would look like the link had worked.
      */}
      {dealerId && dealers && !selected && (
        <p className={styles.missing} role="status">
          That dealership is no longer in {membership.org_name}.{" "}
          <button type="button" className={styles.linkButton} onClick={() => void navigate(basePath)}>
            Back to all dealers
          </button>
        </p>
      )}
    </div>
  );
}
