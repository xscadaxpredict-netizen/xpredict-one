import { CalendarIcon, Edit3Icon, Trash2Icon, FileTextIcon } from "lucide-react";
import type { Enquiry, SiteDetails } from "../../sales/api/types";
import styles from "./ScheduleTable.module.css";

interface Props {
  sites: Enquiry[];
  onUpdateSiteDetails: (siteId: string, field: string, value: string) => void;
}

export function ScheduleTable({ sites, onUpdateSiteDetails }: Props) {
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

  if (sites.length === 0) {
    return (
      <div className={styles.emptyState}>
        <CalendarIcon size={36} className={styles.emptyIcon} />
        <div>No deployed machines found</div>
        <div className={styles.muted}>Confirmed orders will automatically show up here.</div>
      </div>
    );
  }

  return (
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

            return (
              <tr key={site.id} className={styles.row}>
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
                <td className={styles.td}>
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
                <td className={styles.td}>
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
                <td className={styles.tdRight}>
                  <div className={styles.actions}>
                    <button type="button" className={`${styles.iconBtn} ${styles.iconBtnPrimary}`} title="View Latest Report">
                      <FileTextIcon size={14} />
                    </button>
                    <button type="button" className={styles.iconBtn} title="Reschedule Service">
                      <Edit3Icon size={14} />
                    </button>
                    <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete Schedule">
                      <Trash2Icon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
