/**
 * Reference presentational component. Copy this shape.
 *
 * Props in, markup out. No `useQuery`, no router, no `orgSlug`, no `fetch`.
 * That is what makes it renderable in a table, a detail header and a test
 * without any of them knowing about the others.
 *
 * Styling is a CSS Module referencing tokens — never a raw hex. A hex in a diff
 * is a review comment, every time: the point of tokens is that per-dealer
 * branding and dark mode stay a stylesheet change rather than a rewrite.
 */

import type { EnquiryStatus } from "../api/types";
import styles from "./EnquiryStatusBadge.module.css";

const LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

interface EnquiryStatusBadgeProps {
  status: EnquiryStatus;
}

export function EnquiryStatusBadge({ status }: EnquiryStatusBadgeProps) {
  // The class carries the colour; the text carries the meaning. Never colour
  // alone — a colour-blind user and a printed report both need the word.
  return <span className={`${styles.badge} ${styles[status]}`}>{LABELS[status]}</span>;
}
