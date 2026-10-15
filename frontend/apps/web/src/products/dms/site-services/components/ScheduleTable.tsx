import { Fragment, useState } from "react";
import { CalendarIcon, Edit3Icon, Trash2Icon, FileTextIcon, ClockIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { Enquiry, SiteDetails } from "../../sales/api/types";
import type { ScheduleEntry } from "../api/types";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./ScheduleTable.module.css";

interface Props {
  activeTab: "visits" | "deployed";
  sites: Enquiry[];
  schedules?: ScheduleEntry[];
  onUpdateSiteDetails: (siteId: string, field: string, value: string) => void;
  onViewSchedule?: (schedule: ScheduleEntry) => void;
  onEditSchedule?: (schedule: ScheduleEntry) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  onScheduleSite?: (site: Enquiry) => void;
}

export function ScheduleTable({
  activeTab,
  sites,
  schedules = [],
  onUpdateSiteDetails,
  onViewSchedule,
  onEditSchedule,
  onDeleteSchedule,
  onScheduleSite,
}: Props) {
  const { canScheduleService, canEditSchedule, canCancelSchedule } = useDmsPermissions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getDueStatus = (nextDateStr?: string | null) => {
    if (!nextDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(nextDateStr);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `Overdue by ${Math.abs(diffDays)}d`, status: "overdue" as const };
    if (diffDays <= 5) return { label: `Due in ${diffDays}d`, status: "due" as const };
    return { label: `Upcoming (${diffDays}d)`, status: "upcoming" as const };
  };

  const calculateNextDate = (lastDate?: string | null, intervalDays?: string | null) => {
    if (!lastDate || !intervalDays) return null;
    const d = new Date(lastDate);
    d.setDate(d.getDate() + parseInt(intervalDays, 10));
    return d.toISOString().split("T")[0];
  };

  if (activeTab === "visits" && schedules.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CalendarIcon size={36} className={styles.emptyIcon} />
        <div>No scheduled service visits found</div>
        <div className={styles.muted}>Click "+ Schedule Service" to add a new visit schedule.</div>
      </div>
    );
  }

  if (activeTab === "deployed" && sites.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CalendarIcon size={36} className={styles.emptyIcon} />
        <div>No deployed customer sites found</div>
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
                        <div className={styles.bold}>{sch.scheduled_date}</div>
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
                        <span className={`${styles.statusBadge} ${styles.upcoming}`}>
                          {sch.status}
                        </span>
                      </td>
                      <td className={styles.tdRight} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actions}>
                          {onViewSchedule && (
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                              title="View Details"
                              onClick={() => onViewSchedule(sch)}
                            >
                              <FileTextIcon size={14} />
                            </button>
                          )}
                          {onEditSchedule && canEditSchedule && (
                            <button
                              type="button"
                              className={styles.iconBtn}
                              title="Edit Visit"
                              onClick={() => onEditSchedule(sch)}
                            >
                              <Edit3Icon size={14} />
                            </button>
                          )}
                          {onDeleteSchedule && canCancelSchedule && (
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              title="Delete Schedule"
                              onClick={() => onDeleteSchedule(sch.id)}
                            >
                              <Trash2Icon size={14} />
                            </button>
                          )}
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
                              {onViewSchedule && (
                                <button
                                  type="button"
                                  className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                                  onClick={() => onViewSchedule(sch)}
                                >
                                  <FileTextIcon size={14} /> <span>View Details</span>
                                </button>
                              )}
                              {onEditSchedule && canEditSchedule && (
                                <button
                                  type="button"
                                  className={styles.iconBtn}
                                  onClick={() => onEditSchedule(sch)}
                                >
                                  <Edit3Icon size={14} /> <span>Edit Visit</span>
                                </button>
                              )}
                              {onDeleteSchedule && canCancelSchedule && (
                                <button
                                  type="button"
                                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                  onClick={() => onDeleteSchedule(sch.id)}
                                >
                                  <Trash2Icon size={14} /> <span>Delete</span>
                                </button>
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
                const sd = site.site_details || ({} as Partial<SiteDetails>);
                const confirmedQuote = site.quotes.find((q) => q.id === site.confirmed_quote_id);
                const activeAmcQuote = site.quotes.find((q) => q.type === "AMC" && q.status === "CONFIRMED");
                const interval = activeAmcQuote?.service_interval || sd.service_interval || "30";
                const latestReport = site.service_reports?.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                const lastDate = latestReport?.date || sd.last_serviced_date;
                
                const nextDate = calculateNextDate(lastDate, interval);
                const dueStatus = getDueStatus(nextDate);
                const isExpanded = expandedId === site.id;

                return (
                  <Fragment key={site.id}>
                    <tr className={styles.row} onClick={() => toggleExpand(site.id)} style={{ cursor: "pointer" }}>
                      <td className={styles.td}>
                        <div className={styles.customerName}>{site.customer_name}</div>
                        <div className={styles.muted}>{site.address || site.phone}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.ocNumber}>{site.oc_number || "Pending OC"}</div>
                        <div className={styles.muted}>{confirmedQuote?.title || "Unknown Machine"}</div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.serviceType}>{sd.service_type || "Routine Maintenance"}</div>
                        <div className={styles.muted}>Tech: {sd.technician || "Unassigned"}</div>
                      </td>
                      <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          className={styles.inputSmall}
                          placeholder="e.g. DC/01"
                          value={sd.dc_number || ""}
                          onChange={(e) => onUpdateSiteDetails(site.id, "dc_number", e.target.value)}
                        />
                      </td>
                      <td className={styles.td}>
                        <span className={styles.muted}>
                          {activeAmcQuote ? `${activeAmcQuote.service_interval} (from AMC)` : `${sd.service_interval || "30"} Days`}
                        </span>
                      </td>
                      <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                        {latestReport ? (
                          <div className={styles.bold}>{latestReport.date}</div>
                        ) : (
                          <input
                            type="date"
                            className={styles.inputSmall}
                            value={sd.last_serviced_date || ""}
                            onChange={(e) => onUpdateSiteDetails(site.id, "last_serviced_date", e.target.value)}
                          />
                        )}
                      </td>
                      <td className={styles.td}>
                        {nextDate ? (
                          <div>
                            <div className={styles.nextDate}>{nextDate}</div>
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



