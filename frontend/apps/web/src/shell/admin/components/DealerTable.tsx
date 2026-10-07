/**
 * The organisation's dealerships.
 *
 * Three columns, like Users, and for the same reason: the list answers "which
 * dealerships are there, how big, and are they open". Anything more belongs
 * to the one you pick.
 *
 * PEOPLE IS A COUNT, not a list. Who works at a dealership is a question the
 * Users screen answers properly — searchable, and with the actions on it.
 * Repeating names here would be a second half-built version of that screen.
 */

import { Link } from "react-router-dom";

import type { Dealer } from "../api/dealers";
import styles from "./DealerTable.module.css";

interface DealerTableProps {
  dealers: Dealer[];
  /** Base path for a dealer's detail, e.g. `/acme-motors/admin/dealers`. */
  basePath: string;
  selectedId: string | undefined;
  onSelect: (dealerId: string) => void;
}

export function DealerTable({ dealers, basePath, selectedId, onSelect }: DealerTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          Every dealership in this organisation. Select one to see its details.
        </caption>

        <thead>
          <tr>
            <th scope="col">Dealer</th>
            <th scope="col" className={styles.numeric}>
              People
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>

        <tbody>
          {dealers.map((dealer) => (
            <tr
              key={dealer.id}
              className={styles.row}
              data-selected={dealer.id === selectedId || undefined}
              onClick={() => onSelect(dealer.id)}
            >
              <th scope="row" className={styles.dealerCell}>
                <span className={styles.dealerLayout}>
                  <span className={styles.mark} aria-hidden="true">
                    <StoreIcon />
                  </span>

                  <span className={styles.dealer}>
                    {/*
                      The link is the name, not the row. A `<tr onClick>` is
                      invisible to the keyboard and announces nothing; a real
                      link is focusable, middle-clickable and copyable. The row
                      handler is a convenience going to the same place.
                    */}
                    <Link
                      to={`${basePath}/${dealer.id}`}
                      className={styles.name}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {dealer.name}
                    </Link>
                    <span className={styles.since}>
                      {/*
                        The code when there is one: it is what people quote to
                        each other and what ends up on paperwork, so it
                        identifies a row faster than the month it opened.
                      */}
                      {dealer.code ? (
                        <span className={styles.code}>{dealer.code}</span>
                      ) : (
                        `Opened ${formatMonth(dealer.created_at)}`
                      )}
                    </span>
                  </span>
                </span>
              </th>

              <td className={styles.numeric}>
                {dealer.user_count === 0 ? (
                  <span className={styles.nobody}>None</span>
                ) : (
                  <span className={styles.count}>{dealer.user_count}</span>
                )}
              </td>

              <td>
                <span className={styles.status} data-status={dealer.status}>
                  {dealer.status === "active" ? "Open" : "Closed"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "March 2024".
 *
 * `en-GB` explicitly rather than the browser's locale: this is a business
 * record shown to colleagues who may be on different machines, and a date
 * that reads differently for two people looking at the same row is worse
 * than one that is consistently not their preferred format.
 */
export function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function StoreIcon() {
  return (
    <svg
      width="16"
      height="16"
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
