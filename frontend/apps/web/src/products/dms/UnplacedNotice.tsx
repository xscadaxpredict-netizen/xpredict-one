/**
 * NO TERRITORY, NO RECORDS (the owner, 2026-11-24): somebody who holds DMS but
 * has not been assigned a territory can open DMS, and every list is empty --
 * the server answers an empty set, never everything. This says why, on every
 * DMS page, instead of leaving them to think DMS is broken.
 *
 * Never the owner: everywhere by rule, placed nowhere.
 */

import { useShellContext } from "../../shell/context";
import styles from "./UnplacedNotice.module.css";

export function UnplacedNotice() {
  const { membership } = useShellContext();
  const dms = membership.apps.find((app) => app.key === "dms");

  if (membership.role === "owner" || !dms?.accessible || dms.places.length > 0) {
    return null;
  }

  return (
    <p className={styles.notice} role="status">
      <strong>You have not been placed in a territory yet</strong>, so there are no DMS records to
      show. Ask your administrator to assign you to one.
    </p>
  );
}
