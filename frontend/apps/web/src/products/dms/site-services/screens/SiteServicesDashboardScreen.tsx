import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarIcon,
  AlertTriangleIcon,
  FileTextIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  PlusIcon,
  ClockIcon,
  WrenchIcon,
} from "lucide-react";
import {
  useSites,
  useSchedules,
  useServiceReports,
  useComplaints,
} from "../hooks/useSiteServices";
import styles from "./SiteServicesDashboardScreen.module.css";

export function SiteServicesDashboardScreen() {
  const navigate = useNavigate();
  const { data: sites = [], isPending: sitesLoading } = useSites();
  const { data: schedules = [], isPending: schedulesLoading } = useSchedules();
  const { data: reports = [], isPending: reportsLoading } = useServiceReports();
  const { data: complaints = [], isPending: complaintsLoading } = useComplaints();

  const isPending = sitesLoading || schedulesLoading || reportsLoading || complaintsLoading;

  const metrics = useMemo(() => {
    const totalSites = sites.length;

    // Sites with active/confirmed AMC quote
    const amcSites = sites.filter((s) => {
      if (!s.quotes) return false;
      return s.quotes.some((q) => q.type === "AMC" && q.status === "CONFIRMED");
    }).length;

    // Schedule counts
    const scheduledVisits = schedules.filter((s) => s.status === "SCHEDULED").length;
    const inProgressVisits = schedules.filter((s) => s.status === "IN_PROGRESS").length;
    const completedVisits = schedules.filter((s) => s.status === "COMPLETED").length;
    const missedVisits = schedules.filter((s) => s.status === "MISSED").length;

    // Upcoming schedules (sorted by date)
    const upcomingSchedules = [...schedules]
      .filter((s) => s.status === "SCHEDULED" || s.status === "IN_PROGRESS")
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, 5);

    // Complaints
    const openComplaintsList = complaints.filter(
      (c) => c.status === "OPEN" || c.status === "IN_PROGRESS"
    );
    const criticalComplaintsCount = openComplaintsList.filter(
      (c) => c.priority === "CRITICAL" || c.priority === "HIGH"
    ).length;

    // Reports pending sign or approval
    const pendingSignReports = reports.filter(
      (r) => r.status === "AWAITING_CLIENT_SIGN" || r.client_approval_status === "PENDING"
    ).length;

    // Recent reports
    const recentReports = [...reports]
      .sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime())
      .slice(0, 5);

    return {
      totalSites,
      amcSites,
      scheduledVisits,
      inProgressVisits,
      completedVisits,
      missedVisits,
      upcomingSchedules,
      openComplaintsCount: openComplaintsList.length,
      criticalComplaintsCount,
      openComplaints: openComplaintsList.slice(0, 5),
      pendingSignReports,
      recentReports,
    };
  }, [sites, schedules, reports, complaints]);

  if (isPending) {
    return <div style={{ padding: "var(--space-6)" }}>Loading Site Services Dashboard...</div>;
  }

  // Helper map for site names
  const siteNameMap: Record<string, string> = {};
  sites.forEach((s) => {
    siteNameMap[s.id] = s.site_name || s.customer_name || `Site ${s.oc_number}`;
  });

  return (
    <div className={styles.container}>
      {/* Header & Quick Action Buttons */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2>Site Services Dashboard</h2>
          <p>Real-time machine health, AMC coverage, technician scheduling, and customer issue tracking.</p>
        </div>
        <div className={styles.actionButtons}>
          <Link to="../scheduling" className={styles.secondaryBtn}>
            <CalendarIcon size={15} /> Scheduled Services
          </Link>
          <Link to="../complaints" className={styles.secondaryBtn}>
            <AlertTriangleIcon size={15} /> Complaint Box
          </Link>
          <button onClick={() => navigate("../scheduling")} className={styles.primaryBtn}>
            <PlusIcon size={15} /> Schedule Visit
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Installed Sites */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Deployed Sites</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconBlue}`}>
              <WrenchIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.totalSites}</div>
          <div className={styles.kpiFooter}>
            <span className={`${styles.kpiBadge} ${styles.badgeSuccess}`}>
              {metrics.amcSites} with Active AMC
            </span>
            <span className={`${styles.kpiBadge} ${styles.badgeInfo}`}>
              {metrics.totalSites - metrics.amcSites} Warranty / Standard
            </span>
          </div>
        </div>

        {/* Card 2: Upcoming Service Visits */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Scheduled Visits</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconAmber}`}>
              <CalendarIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.scheduledVisits}</div>
          <div className={styles.kpiFooter}>
            <span>{metrics.inProgressVisits} In Progress</span>
            <span>•</span>
            <span style={{ color: "var(--color-success)" }}>{metrics.completedVisits} Completed</span>
          </div>
        </div>

        {/* Card 3: Open Complaints */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Open Complaints</span>
            <div
              className={`${styles.kpiIconWrapper} ${
                metrics.criticalComplaintsCount > 0 ? styles.iconRed : styles.iconAmber
              }`}
            >
              <AlertTriangleIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.openComplaintsCount}</div>
          <div className={styles.kpiFooter}>
            {metrics.criticalComplaintsCount > 0 ? (
              <span className={`${styles.kpiBadge} ${styles.badgeDanger}`}>
                {metrics.criticalComplaintsCount} Critical / High Priority
              </span>
            ) : (
              <span className={`${styles.kpiBadge} ${styles.badgeSuccess}`}>
                All High Priority Resolved
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Reports & Water Tests */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Reports & Sign-offs</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconPurple}`}>
              <FileTextIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{reports.length}</div>
          <div className={styles.kpiFooter}>
            {metrics.pendingSignReports > 0 ? (
              <span className={`${styles.kpiBadge} ${styles.badgePending}`}>
                {metrics.pendingSignReports} Awaiting Sign / Approval
              </span>
            ) : (
              <span className={`${styles.kpiBadge} ${styles.badgeSuccess}`}>
                All Signed & Approved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-Column Grid: Upcoming Visits & Active Complaints */}
      <div className={styles.dualGrid}>
        {/* Left: Upcoming Visits */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <CalendarIcon size={18} color="var(--color-primary)" />
              Upcoming Scheduled Visits
            </div>
            <Link to="../scheduling" className={styles.panelAction}>
              View Calendar <ArrowRightIcon size={12} style={{ display: "inline" }} />
            </Link>
          </div>

          {metrics.upcomingSchedules.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2Icon size={28} color="var(--color-success)" style={{ margin: "0 auto 8px auto", display: "block" }} />
              No pending service visits scheduled right now.
            </div>
          ) : (
            <div className={styles.scheduleList}>
              {metrics.upcomingSchedules.map((sc) => (
                <div key={sc.id} className={styles.scheduleItem}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                      {siteNameMap[sc.site_id] || "Site Visit"}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-3)", marginTop: 2 }}>
                      Type: {sc.service_type || "Routine Maintenance"} • Tech: {sc.technician_display_name || "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <span className={`${styles.kpiBadge} ${styles.badgeInfo}`}>
                      {sc.scheduled_date} {sc.scheduled_time ? `• ${sc.scheduled_time}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Active Customer Complaints */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <AlertTriangleIcon size={18} color="var(--color-danger)" />
              Active Customer Complaints
            </div>
            <Link to="../complaints" className={styles.panelAction}>
              Complaint Box <ArrowRightIcon size={12} style={{ display: "inline" }} />
            </Link>
          </div>

          {metrics.openComplaints.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2Icon size={28} color="var(--color-success)" style={{ margin: "0 auto 8px auto", display: "block" }} />
              No open customer complaints. All clear!
            </div>
          ) : (
            <div className={styles.complaintList}>
              {metrics.openComplaints.map((comp) => {
                const isCrit = comp.priority === "CRITICAL" || comp.priority === "HIGH";
                return (
                  <div
                    key={comp.id}
                    className={`${styles.complaintItem} ${isCrit ? styles.complaintCritical : ""}`}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                        {siteNameMap[comp.site_id] || "Client Site"}
                      </div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-2)", marginTop: 2 }}>
                        {comp.description}
                      </div>
                      {comp.assigned_service_person_name && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-3)", marginTop: 4 }}>
                          Assigned: {comp.assigned_service_person_name}
                        </div>
                      )}
                    </div>
                    <div>
                      <span
                        className={`${styles.kpiBadge} ${
                          isCrit ? styles.badgeDanger : styles.badgePending
                        }`}
                      >
                        {comp.priority}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


      {/* Bottom Table: Recent Service Reports */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <ClockIcon size={18} color="var(--color-text-2)" />
            Recent Service Reports
          </div>
          <Link to="../reports" className={styles.panelAction}>
            View All Reports <ArrowRightIcon size={12} style={{ display: "inline" }} />
          </Link>
        </div>

        {metrics.recentReports.length === 0 ? (
          <div className={styles.emptyState}>No service reports filed yet.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Report Code</th>
                  <th>Site Name</th>
                  <th>Technician</th>
                  <th>Service Date</th>
                  <th>Report Status</th>
                  <th>Client Approval</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentReports.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.report_code || "SR-DRAFT"}</td>
                    <td>{siteNameMap[r.site_id] || "—"}</td>
                    <td>{r.technician_display_name || r.service_person_name || "—"}</td>
                    <td style={{ color: "var(--color-text-3)", fontSize: "var(--text-xs)" }}>
                      {r.service_date}
                    </td>
                    <td>
                      <span
                        className={`${styles.kpiBadge} ${
                          r.status === "COMPLETED"
                            ? styles.badgeSuccess
                            : r.status === "AWAITING_CLIENT_SIGN"
                            ? styles.badgePending
                            : styles.badgeInfo
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.kpiBadge} ${
                          r.client_approval_status === "APPROVED"
                            ? styles.badgeSuccess
                            : r.client_approval_status === "REJECTED"
                            ? styles.badgeDanger
                            : styles.badgePending
                        }`}
                      >
                        {r.client_approval_status || "PENDING"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
