/**
 * DMS settings -> Masters -> BANK ACCOUNTS, in the list format every list page
 * shares (C78; `listPageStyles` in packages/ui): title, a toolbar with the
 * filter on the left and Add on the right, a table, a ⋮ per row.
 *
 * Was the first tab of "Load Master Data" (moved 2026-11-25, restyled the same
 * day). Owner only, like the rest of the gear; the add / edit dialog is the
 * old one, unchanged.
 */

import { useState } from "react";
import { asProblem } from "@xpredict/api-client";
import {
  ConfirmDialog,
  ErrorState,
  ListFilter,
  RowMenu,
  TableSkeleton,
  listPageStyles as listStyles,
} from "@xpredict/ui";

import { usePageSearch } from "../../../stores/pageSearchStore";
import { useBanks, useDeleteBank } from "../sales/hooks/useEnquiries";
import type { BankAccount } from "../sales/api/types";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import { BankAccountModal } from "./BankAccountModal";
import { PlusIcon } from "./icons";
import styles from "./Masters.module.css";

type Filter = "all" | "org" | "dealer";

const FILTERS = [
  { value: "all", label: "All accounts" },
  { value: "org", label: "Organisation" },
  { value: "dealer", label: "Dealerships" },
] as const;

function isOrgBank(bank: BankAccount): boolean {
  return Boolean(bank.is_org_bank) || !bank.unit_id;
}

export function BankAccountsPage() {
  const { data: banks, isPending, isError, error, refetch } = useBanks();
  const deleteBank = useDeleteBank();
  const { canManageSettings } = useDmsPermissions();
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<BankAccount | "new" | null>(null);
  const [deleting, setDeleting] = useState<BankAccount | null>(null);

  const shown = banks?.filter((bank) => {
    const scope = isOrgBank(bank) ? "org" : "dealer";
    return (filter === "all" || filter === scope) && matches(bank, query);
  });

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Bank Accounts</h1>
      </div>

      <div className={listStyles.toolbar}>
        <ListFilter id="bank-accounts-filter" value={filter} options={FILTERS} onChange={setFilter} />
        {shown && (
          <span className={listStyles.count} aria-live="polite">
            {shown.length === 1 ? "1 account" : `${String(shown.length)} accounts`}
          </span>
        )}
        <span className={listStyles.spacer} />
        <button
          type="button"
          className={listStyles.primaryButton}
          aria-disabled={canManageSettings ? undefined : "true"}
          title={canManageSettings ? undefined : "You do not have permission to add bank accounts"}
          onClick={() => canManageSettings && setEditing("new")}
        >
          <PlusIcon />
          Add Bank Account
        </button>
      </div>

      <div className={listStyles.listArea}>
        {isPending && <TableSkeleton label="bank accounts" columns={[240, 140, 120, 160, 120, 56]} rows={4} />}

        {isError && (
          <ErrorState
            title="Could not load bank accounts"
            code={asProblem(error).code}
            traceId={asProblem(error).trace_id}
            onRetry={() => void refetch()}
          />
        )}

        {shown && (
          <div className={listStyles.tableWrap}>
            <table className={listStyles.table}>
              <caption className={listStyles.visuallyHidden}>
                The bank accounts printed on quotations.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Bank</th>
                  <th scope="col">Account no.</th>
                  <th scope="col">IFSC</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Belongs to</th>
                  <th scope="col" className={listStyles.actions}>
                    <span className={listStyles.visuallyHidden}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((bank) => (
                  <tr key={bank.id}>
                    <th scope="row">
                      <div className={listStyles.entity}>
                        <span className={listStyles.primary}>{bank.bank_name}</span>
                        {bank.is_default && <span className={styles.defaultTag}>Default</span>}
                      </div>
                    </th>
                    <td>{bank.account_no}</td>
                    <td>{bank.ifsc_code}</td>
                    <td>{bank.branch_name || <span className={listStyles.none}>—</span>}</td>
                    <td>
                      <Scope org={isOrgBank(bank)} />
                    </td>
                    <td className={listStyles.actions}>
                      <RowMenu
                        label={`More actions for ${bank.bank_name}`}
                        items={[
                          { label: "Edit", disabled: !canManageSettings, onSelect: () => setEditing(bank) },
                          {
                            label: "Delete",
                            danger: true,
                            disabled: !canManageSettings,
                            onSelect: () => setDeleting(bank),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {shown.length === 0 && (
              <p className={listStyles.empty}>
                {banks && banks.length > 0
                  ? "No bank accounts match."
                  : "No bank accounts yet. Add one to print it on quotations."}
              </p>
            )}
          </div>
        )}
      </div>

      {editing && (
        <BankAccountModal
          open
          onClose={() => setEditing(null)}
          bank={editing === "new" ? undefined : editing}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete bank account"
        message={`Delete ${deleting?.bank_name ?? "this bank account"}? It will no longer be offered on quotations.`}
        intent="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) deleteBank.mutate(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** "Organisation" or "Dealership": who a bank account or product belongs to. */
export function Scope({ org }: { org: boolean }) {
  return (
    <span className={styles.scope} data-scope={org ? "org" : "dealer"}>
      {org ? "Organisation" : "Dealership"}
    </span>
  );
}

function matches(bank: BankAccount, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [bank.bank_name, bank.account_no, bank.ifsc_code, bank.branch_name ?? ""].some((text) =>
    text.toLowerCase().includes(q),
  );
}
