/**
 * One dealership: how many people it has, when it opened, and how to close it.
 *
 * "People" links through to Users rather than listing anybody here. Who works
 * at a dealership is a question Users already answers, searchable and with
 * the actions attached — a second, worse copy of that list is not worth the
 * two lines it would save.
 *
 * CLOSING IS NOT DELETING. A dealership with history cannot be removed
 * without taking its enquiries, quotations and job cards with it, so there is
 * no delete here at all — only open and closed.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "react-router-dom";
import { asProblem } from "@xpredict/api-client";
import { DetailPanel } from "@xpredict/ui";

import type { Dealer } from "../api/dealers";
import { useSetDealerStatus } from "../hooks/useDealers";
import { EditDealerDialog } from "./EditDealerDialog";
import { formatMonth } from "./DealerTable";
import styles from "./DealerDetailPanel.module.css";

interface DealerDetailPanelProps {
  dealer: Dealer;
  /** Where Users lives, so the people count can link to it. */
  usersPath: string;
  onClose: () => void;
}

export function DealerDetailPanel({ dealer, usersPath, onClose }: DealerDetailPanelProps) {
  const { mutate: setStatus, isPending, error } = useSetDealerStatus();

  const isClosed = dealer.status === "disabled";

  return (
    <DetailPanel
      label={dealer.name}
      onClose={onClose}
      header={
        <>
          <span className={styles.mark} aria-hidden="true">
            <StoreIcon />
          </span>

          <div className={styles.identity}>
            <h2 className={styles.name}>{dealer.name}</h2>
            <p className={styles.since}>
              {dealer.code && <span className={styles.code}>{dealer.code}</span>}
              Opened {formatMonth(dealer.created_at)}
            </p>
          </div>
        </>
      }
      footer={
        <>
          <EditDealerDialog dealer={dealer} />

          <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.moreTrigger} aria-label="More actions">
            <MoreIcon />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
              <DropdownMenu.Item
                className={styles.menuItem}
                disabled={isPending}
                onSelect={() =>
                  setStatus({ dealerId: dealer.id, status: isClosed ? "active" : "disabled" })
                }
              >
                {isClosed ? "Reopen dealership" : "Close dealership"}
              </DropdownMenu.Item>

              {/*
                Said before the click, not after. Closing a dealership with
                people in it is the case somebody will hit by accident, and
                the count is the only warning that matters.
              */}
              {!isClosed && dealer.user_count > 0 && (
                <p className={styles.menuNote}>
                  {dealer.user_count === 1
                    ? "1 person is scoped to this dealer."
                    : `${String(dealer.user_count)} people are scoped to this dealer.`}
                </p>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      }
    >
      <div className={styles.pills}>
        <span className={styles.status} data-status={dealer.status}>
          {isClosed ? "Closed" : "Open"}
        </span>
      </div>

      <dl className={styles.facts}>
        {dealer.parent_name && (
          <>
            <dt>Reports to</dt>
            <dd>
              <span className={styles.parent}>{dealer.parent_name}</span>
            </dd>
          </>
        )}

        <dt>Contact</dt>
        <dd>
          <span className={styles.contactName}>{dealer.contact_person}</span>
          {/*
            Real links, not text. Somebody reading this panel is usually about
            to ring or email the branch, and making them copy it by hand is a
            small tax paid every single time.
          */}
          <a className={styles.link} href={`mailto:${dealer.email}`}>
            {dealer.email}
          </a>
          <a className={styles.link} href={`tel:${dealer.phone.replace(/\s/g, "")}`}>
            {dealer.phone}
          </a>
        </dd>

        <dt>Address</dt>
        <dd>
          <span className={styles.address}>
            {dealer.city}, {dealer.state}
          </span>
          <span className={styles.postal}>{dealer.postal_code}</span>
        </dd>

        <dt>People</dt>
        <dd>
          {dealer.user_count === 0 ? (
            <span className={styles.note}>
              Nobody is scoped to this dealer yet. Invite someone and pick it as their dealer.
            </span>
          ) : (
            <>
              <span className={styles.count}>
                {dealer.user_count === 1 ? "1 person" : `${String(dealer.user_count)} people`}
              </span>
              <Link className={styles.link} to={usersPath}>
                See them in Users
              </Link>
            </>
          )}
        </dd>

        <dt>Scope</dt>
        <dd>
          {/*
            Worth stating on every dealership. A reader who has not met C5 will
            assume a dealer partitions everything, and then wonder why the CRM
            list is not filtered.
          */}
          <span className={styles.note}>
            Dealers divide DMS only. CRM and the rest are organisation-wide, so somebody
            scoped here still sees all of those.
          </span>
        </dd>
      </dl>

      {error && (
        <p className={styles.error} role="alert">
          {asProblem(error).detail}
        </p>
      )}
    </DetailPanel>
  );
}

function StoreIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.6 8.6h16.8l-1.3-4.1a1.2 1.2 0 0 0-1.15-.9H6.05a1.2 1.2 0 0 0-1.15.9z" />
      <path d="M5.2 8.6V20a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V8.6" />
      <path d="M9.6 21v-5.4h4.8V21" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}
