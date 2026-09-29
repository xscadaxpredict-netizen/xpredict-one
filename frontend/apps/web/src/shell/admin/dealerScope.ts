/**
 * What a person who belongs to ONE dealer may be given access to (C27).
 *
 * THE RULE: a dealer-scoped person may hold DMS and Administration. Not CRM,
 * not E-commerce.
 *
 * WHY EACH ONE IS IN OR OUT, because "DMS only" is the obvious reading and it
 * is wrong:
 *
 *   dms    IN  — the only unit-aware product (C5). Its data is split by dealer,
 *                so a dealer-scoped person sees their own dealer and no other.
 *
 *   admin  IN  — not a product at all (C17): Administration comes with the
 *                platform and is gated by role, never bought. A dealer admin
 *                holds it narrowed to Users at their own dealer (C23), and that
 *                is the whole mechanism by which an organisation hands a
 *                dealership its own administrator. Excluding it here would make
 *                a dealer admin impossible to create.
 *
 *   crm    OUT — not unit-aware, so it does no dealer filtering at all. A
 *   ecom   OUT   dealer-scoped person granted CRM would see EVERY dealer's
 *                customers in the organisation. C7 originally permitted this as
 *                an audited override and called the consequence "a footgun";
 *                C27 settled that it is not a footgun but an isolation failure,
 *                in a system whose entire premise is that Dealer A cannot see
 *                Dealer B.
 *
 * A dealership that genuinely needs CRM founds its own organisation and
 * subscribes (C27). The same account belongs to both, so it stays one login.
 *
 * THIS IS NOT SECURITY. It decides which controls a form offers. Django refuses
 * the grant in `grant_app_access()` regardless, and if the two ever disagree
 * Django is right (C19). The danger is not an attacker — it is a developer
 * seeing this rule enforced on screen and skipping it in the service function.
 *
 * It lives here, in one file, rather than inside either dialog, because it is
 * needed by both the invite form and the edit form. Same reasoning as
 * `visibleApps()` in `shell/navigation.ts`: a rule copied into two components
 * is a rule that will disagree with itself the first time somebody edits one of
 * them.
 */

/**
 * Apps that can coexist with a dealer. Everything else is an
 * organisation-wide product and cannot.
 */
const DEALER_SCOPABLE_APPS = new Set<string>(["dms", "admin"]);

/** May somebody scoped to one dealer hold this app? */
export function isDealerScopable(appKey: string): boolean {
  return DEALER_SCOPABLE_APPS.has(appKey);
}

export interface DealerScopeRules {
  /** Whether the dealer picker can be used at all. */
  canPickDealer: boolean;
  /**
   * The line under the dealer picker. Always present: a control that is off
   * without saying why reads as broken, and the reason here is the model
   * rather than an arbitrary rule.
   */
  dealerNote: string;
  /** Whether this app's checkbox must be locked. */
  isAppLocked: (appKey: string) => boolean;
  /** The line under the apps list, or null when nothing is constrained. */
  appsNote: string | null;
}

/**
 * The two fields constrain EACH OTHER, and that is the point of this function.
 *
 * Before C27 the coupling ran one way only — clearing DMS cleared the dealer —
 * which left an organisation admin free to tick DMS *and* CRM *and* pick a
 * dealer. The form accepted it and the backend would have been right to refuse
 * it.
 *
 * REMOVING AN APP IS NEVER BLOCKED, only adding one. A person granted a
 * forbidden combination before this rule existed — or by a backend that let it
 * through — must be able to unwind it. Locking a checkbox that is already
 * ticked would leave their record permanently unfixable, with the form
 * refusing the only edit that would bring it into line.
 *
 * @param selectedApps app keys currently ticked on the form
 * @param unitId       the chosen dealer, or "" for organisation-wide
 */
export function dealerScopeRules(selectedApps: string[], unitId: string): DealerScopeRules {
  const hasDms = selectedApps.includes("dms");
  const hasOrgWideApp = selectedApps.some((key) => !isDealerScopable(key));
  const dealerChosen = unitId !== "";

  return {
    canPickDealer: hasDms && !hasOrgWideApp,

    dealerNote: hasOrgWideApp
      ? "Somebody who belongs to one dealer can only have DMS and Administration. Clear the other apps to scope this person to a dealer."
      : !hasDms
        ? "Only DMS is split by dealer. Select DMS above to scope this person to one."
        : "Leave as Organisation for someone who works across every dealer.",

    isAppLocked: (appKey) =>
      dealerChosen && !isDealerScopable(appKey) && !selectedApps.includes(appKey),

    appsNote: dealerChosen
      ? "Set the dealer back to Organisation to grant an app that is not split by dealer."
      : null,
  };
}
