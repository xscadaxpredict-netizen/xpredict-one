/**
 * The populated state. Presentational: props in, markup out.
 *
 * A real <table> with <th scope>, not divs with ARIA roles. Screen readers
 * announce row and column position from a real table for free, and a
 * dealership back office navigates this with a keyboard all day.
 */

import { Link } from "react-router-dom";

import type { Enquiry } from "../api/types";
import { EnquiryStatusBadge } from "./EnquiryStatusBadge";
import styles from "./EnquiryTable.module.css";

const SOURCE_LABELS: Record<Enquiry["source"], string> = {
  walk_in: "Walk-in",
  call: "Call",
  web: "Web",
};

interface EnquiryTableProps {
  enquiries: Enquiry[];
  total: number;
}

export function EnquiryTable({ enquiries, total }: EnquiryTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          {`Enquiries, showing ${enquiries.length} of ${total}`}
        </caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Customer</th>
            <th scope="col">Source</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.right}>
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {enquiries.map((enquiry) => (
            <tr key={enquiry.id}>
              <td>
                {/* Mono, so a transposed digit in a reference is visible. */}
                <Link to={enquiry.id} className={styles.reference}>
                  {enquiry.reference}
                </Link>
              </td>
              <td>
                <div className={styles.customerName}>{enquiry.customer_name}</div>
                <div className={styles.customerMeta}>{enquiry.customer_phone}</div>
              </td>
              <td className={styles.muted}>{SOURCE_LABELS[enquiry.source]}</td>
              <td>
                <EnquiryStatusBadge status={enquiry.status} />
              </td>
              <td className={`${styles.muted} ${styles.right}`}>
                <RelativeTime iso={enquiry.updated_at} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Relative time with the exact value in the tooltip.
 *
 * "2 hours ago" is what someone scanning a list wants; the precise timestamp is
 * what they need when it matters. Show both rather than choosing.
 */
function RelativeTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);

  const label =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 60 * 24
          ? `${Math.round(minutes / 60)} h ago`
          : date.toLocaleDateString();

  return <time dateTime={iso} title={date.toLocaleString()}>{label}</time>;
}
