/**
 * The words for what somebody administers. No React in this file.
 *
 * THESE TWO STRINGS USED TO COME FROM THE SERVER, as if they were role names
 * sitting in `apps` beside "Sales representative". They are not names of
 * anything: there is no Role row for Administration and the schema refuses to
 * create one (C40, C44), so "Organisation admin" describes a state the server
 * DERIVES rather than a record it holds.
 *
 * C53 moved the wording here. The server sends which kind — "organisation" or
 * "dealer" — and the browser picks the words, which is the same split
 * `selectors._summary()` already makes on the backend: Django sends a dealer
 * count, the frontend writes the sentence around it. The practical difference
 * is that fixing a typo in either of these is a frontend change.
 *
 * WHY IT IS A MODULE AND NOT A CONSTANT IN ONE COMPONENT: both the list and
 * the detail panel show it, and two copies of a label drift the moment one of
 * them is edited.
 */

import type { OrgUser } from "./api/users";

/**
 * What to show next to somebody's apps, or null if they administer nothing.
 *
 * `null` is a real and common answer — a salesperson administers nothing —
 * and callers must render nothing rather than an empty badge.
 */
export function administersLabel(administers: OrgUser["administers"]): string | null {
  if (administers === "organisation") return "Organisation admin";
  if (administers === "dealer") return "Dealer admin";
  return null;
}
