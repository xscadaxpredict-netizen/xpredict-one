import { Fragment, useEffect, useState } from "react";
import { CalendarIcon, ClockIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ConfirmedSite, ScheduleEntry } from "../api/types";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import { VisitActions, VisitStatusBadge, type VisitHandlers } from "./VisitActions";
import { visitHistoryLines } from "./visitStatus";
import styles from "./ScheduleTable.module.css";
import { formatDate, formatDateTime, parseApiDate } from "../../shared/format/date";
import { intervalToDays } from "../../shared/format/interval";

/** Used when neither an active AMC nor the site profile sets an interval. */
const DEFAULT_INTERVAL_DAYS = 30;

/** The ISO date ("YYYY-MM-DD", local) `days` after `iso`. */
function addDaysIso(iso: string, days: number): string | null {
  const d = parseApiDate(iso);
  if (!d) return null;
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-${dd}`;
}

/**
 * A site-profile field edited in place. Keeps its own draft so typing is not
 * fought by the server value; saves on blur or Enter (text) or on pick (date),
 * and follows the server value whenever it is not being edited.
 */
function ProfileInput({
  type,
  value,
  placeholder,
  onSave,
}: {
  type: "text" | "date";
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = (next: string) => {
    if (next !== value) onSave(next);
  };

  return (
    <input
      type={type}
      className={styles.inputSmall}
      placeholder={placeholder}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setDraft(e.target.value);
        // A date picker sets a whole value at once; a half-typed date is "" until complete.
        if (type === "date" && e.target.value) commit(e.target.value);
      }}
      onBlur={() => {
        setEditing(false);
        commit(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

interface Props extends VisitHandlers {
  activeTab: "visits" | "deployed";
  sites: ConfirmedSite[];
  schedules?: ScheduleEntry[];
  onUpdateSiteDetails: (siteId: string, field: string, value: string) => void;
  onScheduleSite?: (site: ConfirmedSite) => void;
  /** The signed-in person: Start and File report are offered on their own visits. */
  currentUserId: string;
  /** Sees and runs every visit (vs. only their own). */
  canManage: boolean;
}

export function ScheduleTable({
  activeTab,
  sites,
  schedules = [],
  onUpdateSiteDetails,
  onScheduleSite,
  currentUserId,
  canManage,
  ...handlers
}: Props) {
  const { canScheduleService, canEditSchedule, canCancelSchedule } = useDmsPermissions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getDueStatus = (nextDateStr?: string | null) => {
    const target = parseApiDate(nextDateStr);
    if (!target) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `Overdue by ${Math.abs(diffDays)}d`, status: "overdue" as const };
    if (diffDays <= 5) return { label: `Due in ${diffDays}d`, status: "due" as const };
    return { label: `Upcoming (${diffDays}d)`, status: "upcoming" as const };
  };

  if (activeTab === "visits" && schedules.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CalendarIcon size={36} className={styles.emptyIcon} />
        <div>No scheduled service visits found</div>
        <div className={styles.muted}>
          {canManage ? 'Click "+ Schedule Service" to add a new visit schedule.' : "No visits are assigned to you right now."}
        </div>
      </div>
    );
  }

  if (activeTab === "deployed" && sites.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CalendarIcon size={36} className={styles.emptyIcon} />
        <div>No site is under AMC yet</div>
        <div style={{ fontSize: "0.85rem", marginTop: "4px" }}>
          A site appears here once its AMC quote is confirmed on the AMC tab.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Sub Tab 1: Scheduled Visits */}
      {activeTab === "visits" && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Scheduled Date</th>
                <th className={styles.th}>Site / Customer</th>
                <th className={styles.th}>Service Type</th>
                <th className={styles.th}>Technician</th>
                <th className={styles.th}>Notes</th>
                <th className={styles.th}>Status</th>
                <th className={styles.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((sch) => {
                const site = sites.find((s) => s.id === sch.site_id);
                const isExpanded = expandedId === sch.id;
                return (
                  <Fragment key={sch.id}>
                    <tr className={styles.row} onClick={() => toggleExpand(sch.id)} style={{ cursor: "pointer" }}>
                      <td className={styles.td}>
                        <div className={styles.bold}>{formatDate(sch.scheduled_date)}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.customerName}>{site?.customer_name || "Deployed Site"}</div>
                        <div className={styles.muted}>{site?.oc_number || "OC N/A"}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.serviceType}>{sch.service_type || "Routine Maintenance"}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.bold}>{sch.technician_display_name || "Unassigned"}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.muted}>{sch.notes || "—"}</div>
                      </td>
                      <td className={styles.td}>
                        <VisitStatusBadge visit={sch} />
                      </td>
                      <td className={styles.tdRight} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actions}>
                          <VisitActions
                            visit={sch}
                            currentUserId={currentUserId}
                            canEdit={canEditSchedule}
                            canCancel={canCancelSchedule}
                            canManage={canManage}
                            {...handlers}
                          />
                          <button
                            type="button"
                            className={styles.expandBtn}
                            title="Toggle actions"
                            onClick={() => toggleExpand(sch.id)}
                          >
                            {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className={styles.expandedCell}>
                          <div className={styles.expandedContent}>
                            <div className={styles.mobileActionsBar}>
                              <VisitActions
                                visit={sch}
                                currentUserId={currentUserId}
                                canEdit={canEditSchedule}
                                canCancel={canCancelSchedule}
                                canManage={canManage}
                                withLabels
                                {...handlers}
                              />
                            </div>
                            <div className={styles.visitTimeline}>
                              {sch.assigned_at && <span>Assigned {formatDateTime(sch.assigned_at)}</span>}
                              {sch.started_at && <span>Started {formatDateTime(sch.started_at)}</span>}
                              {sch.completed_at && <span>Completed {formatDateTime(sch.completed_at)}</span>}
                              {visitHistoryLines(sch).map((line, i) => (
                                <span key={i}>{line}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub Tab 2: Deployed Sites Overview */}
      {activeTab === "deployed" && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Site / Customer</th>
                <th className={styles.th}>OC & Machine</th>
                <th className={styles.th}>Service Type & Tech</th>
                <th className={styles.th}>DC Number</th>
                <th className={styles.th}>Interval</th>
                <th className={styles.th}>Last Serviced</th>
                <th className={styles.th}>Next Service Date</th>
                <th className={styles.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const profile = site.service_profile;
                const confirmedQuote = site.quotes.find((q) => q.id === site.confirmed_quote_id);
                const activeAmcQuote = site.quotes.find((q) => q.type === "AMC" && q.status === "CONFIRMED");
                // An active AMC sets the interval; otherwise the site profile; otherwise 30 days.
                const amcDays = intervalToDays(activeAmcQuote?.service_interval);
                const intervalDays = amcDays ?? profile?.service_interval_days ?? DEFAULT_INTERVAL_DAYS;
                // The last real visit (a service report) wins over a date typed in by hand.
                const lastDate = site.last_service_report_date || profile?.last_serviced_date || null;
                const nextDate = lastDate ? addDaysIso(lastDate, intervalDays) : null;
                const dueStatus = getDueStatus(nextDate);
                const isExpanded = expandedId === site.id;

                return (
                  <Fragment key={site.id}>
                    <tr className={styles.row} onClick={() => toggleExpand(site.id)} style={{ cursor: "pointer" }}>
                      <td className={styles.td}>
                        <div className={styles.customerName}>{site.customer_name}</div>
                        <div className={styles.muted}>{site.address || site.site_name}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.ocNumber}>{site.oc_number || "Pending OC"}</div>
                        <div className={styles.muted}>{confirmedQuote?.title || "Machine not linked"}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.serviceType}>{profile?.service_type || "Routine Maintenance"}</div>
                        <div className={styles.muted}>Tech: {profile?.technician_display_name || "Unassigned"}</div>
                      </td>
                      <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                        <ProfileInput
                          type="text"
                          placeholder="e.g. DC/01"
                          value={profile?.dc_number ?? ""}
                          onSave={(v) => onUpdateSiteDetails(site.id, "dc_number", v)}
                        />
                      </td>
                      <td className={styles.td}>
                        <span className={styles.muted}>
                          {activeAmcQuote && amcDays
                            ? `${activeAmcQuote.service_interval} (from AMC)`
                            : `${intervalDays} days`}
                        </span>
                      </td>
                      <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                        {site.last_service_report_date ? (
                          <div>
                            <div className={styles.bold}>{formatDate(site.last_service_report_date)}</div>
                            <div className={styles.muted}>from service report</div>
                          </div>
                        ) : (
                          <ProfileInput
                            type="date"
                            value={profile?.last_serviced_date ?? ""}
                            onSave={(v) => onUpdateSiteDetails(site.id, "last_serviced_date", v)}
                          />
                        )}
                      </td>
                      <td className={styles.td}>
                        {nextDate ? (
                          <div>
                            <div className={styles.nextDate}>{formatDate(nextDate)}</div>
                            {dueStatus && (
                              <span className={`${styles.statusBadge} ${styles[dueStatus.status]}`}>
                                {dueStatus.label}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={styles.muted}>Set last date</span>
                        )}
                      </td>
                      <td className={styles.tdRight} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actions}>
                          {onScheduleSite && canScheduleService && (
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                              title="Schedule Visit for Site"
                              onClick={() => onScheduleSite(site)}
                            >
                              <ClockIcon size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.expandBtn}
                            title="Toggle actions"
                            onClick={() => toggleExpand(site.id)}
                          >
                            {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className={styles.expandedCell}>
                          <div className={styles.expandedContent}>
                            <div className={styles.mobileActionsBar}>
                              {onScheduleSite && canScheduleService && (
                                <button
                                  type="button"
                                  className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                                  onClick={() => onScheduleSite(site)}
                                >
                                  <ClockIcon size={14} /> <span>Schedule Visit</span>
                                </button>
                              )}
                            </div>

                            {/* This site's visits, editable here --- they used to be reachable
                                only from the other tab, so most people never found Edit/Delete. */}
                            <div className={styles.siteVisits}>
                              <div className={styles.siteVisitsTitle}>Scheduled visits</div>
                              {schedules.filter((v) => v.site_id === site.id).length === 0 ? (
                                <div className={styles.muted}>No visits scheduled for this site yet.</div>
                              ) : (
                                schedules
                                  .filter((v) => v.site_id === site.id)
                                  .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
                                  .map((v) => (
                                    <div key={v.id} className={styles.siteVisitRow}>
                                      <span className={styles.bold}>{formatDate(v.scheduled_date)}</span>
                                      <span>{v.service_type || "Routine Maintenance"}</span>
                                      <span className={styles.muted}>{v.technician_display_name || "Unassigned"}</span>
                                      <VisitStatusBadge visit={v} />
                                      <span className={styles.actions}>
                                        <VisitActions
                                          visit={v}
                                          currentUserId={currentUserId}
                                          canEdit={canEditSchedule}
                                          canCancel={canCancelSchedule}
                                          canManage={canManage}
                                          {...handlers}
                                        />
                                      </span>
                                    </div>
                                  ))
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



