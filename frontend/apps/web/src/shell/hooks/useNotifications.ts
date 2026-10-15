import { useMemo, useState } from "react";
import { useEnquiries } from "../../products/dms/sales/hooks/useEnquiries";
import { useSchedules, useComplaints, useSites } from "../../products/dms/site-services/hooks/useSiteServices";
import { useTechSupport } from "../../products/dms/tech-support/api/techSupport";

export type NotificationType = "followup" | "service" | "complaint" | "call";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  details?: string;
  targetDate?: string;
  dueLabel: string;
  urgency: "urgent" | "warning" | "info" | "normal";
  path: string;
}

/**
 * Calculates day difference from targetDateStr (YYYY-MM-DD) to current date:
 * - Negative: Past / Overdue
 * - 0: Today
 * - 1: Tomorrow (1 day before)
 * - 2: In 2 days (2 days before)
 * - > 2: Farther in the future
 */
function getDaysDiff(targetDateStr: string): number {
  if (!targetDateStr) return 999;
  try {
    const parts = targetDateStr.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (y === undefined || m === undefined || d === undefined || isNaN(y) || isNaN(m) || isNaN(d)) return 999;
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 999;
  }
}

export function useNotifications(orgSlug: string) {
  const { data: enquiries = [] } = useEnquiries();
  const { data: schedules = [] } = useSchedules();
  const { data: complaints = [] } = useComplaints();
  const { data: sites = [] } = useSites();
  const { calls = [] } = useTechSupport(orgSlug);

  // Read / Dismissed IDs in local state
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`notifs_read_${orgSlug}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(`notifs_read_${orgSlug}`, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const markAllAsRead = (ids: string[]) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      try {
        localStorage.setItem(`notifs_read_${orgSlug}`, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const notifications = useMemo(() => {
    const list: AppNotification[] = [];

    // Map site names for fast lookup
    const siteMap: Record<string, string> = {};
    sites.forEach((s) => {
      siteMap[s.id] = s.site_name || s.customer_name || `Site ${s.oc_number}`;
    });

    // 1. Sales Follow-ups (2 days before, 1 day before, today, overdue)
    enquiries.forEach((enquiry) => {
      if (enquiry.status === "PENDING" && enquiry.followups && enquiry.followups.length > 0) {
        enquiry.followups.forEach((fu) => {
          if (fu.next_followup_date) {
            const diff = getDaysDiff(fu.next_followup_date);
            if (diff <= 2) {
              let dueLabel = "Due in 2 Days";
              let urgency: AppNotification["urgency"] = "info";

              if (diff < 0) {
                dueLabel = "Overdue Follow-up";
                urgency = "urgent";
              } else if (diff === 0) {
                dueLabel = "Due Today";
                urgency = "urgent";
              } else if (diff === 1) {
                dueLabel = "Due Tomorrow";
                urgency = "warning";
              }

              list.push({
                id: `fu-${enquiry.id}-${fu.id || fu.next_followup_date}`,
                type: "followup",
                title: `Follow-up: ${enquiry.customer_name}`,
                subtitle: fu.remarks || "Sales enquiry follow-up required",
                details: enquiry.phone ? `Phone: ${enquiry.phone}` : undefined,
                targetDate: fu.next_followup_date,
                dueLabel,
                urgency,
                path: `/${orgSlug}/dms/sales/enquiries`,
              });
            }
          }
        });
      }
    });

    // 2. Site Service Scheduled Visits (2 days before, 1 day before, today, overdue)
    schedules.forEach((sc) => {
      if (sc.status === "SCHEDULED" || sc.status === "IN_PROGRESS") {
        const diff = getDaysDiff(sc.scheduled_date);
        if (diff <= 2) {
          let dueLabel = "Visit in 2 Days";
          let urgency: AppNotification["urgency"] = "info";

          if (diff < 0) {
            dueLabel = "Overdue Visit";
            urgency = "urgent";
          } else if (diff === 0) {
            dueLabel = "Visit Today";
            urgency = "urgent";
          } else if (diff === 1) {
            dueLabel = "Visit Tomorrow";
            urgency = "warning";
          }

          const siteName = siteMap[sc.site_id] || "Installed Site";

          list.push({
            id: `sc-${sc.id}`,
            type: "service",
            title: `Service Visit: ${siteName}`,
            subtitle: `${sc.service_type || "Routine Maintenance"} • Tech: ${sc.technician_display_name || "Unassigned"}`,
            details: sc.notes ? `Note: ${sc.notes}` : undefined,
            targetDate: sc.scheduled_date,
            dueLabel,
            urgency,
            path: `/${orgSlug}/dms/site-services/scheduling`,
          });
        }
      }
    });

    // 3. Customer Complaints (show until resolved or closed)
    complaints.forEach((comp) => {
      if (comp.status === "OPEN" || comp.status === "IN_PROGRESS") {
        const isCrit = comp.priority === "CRITICAL" || comp.priority === "HIGH";
        const siteName = siteMap[comp.site_id] || "Customer Site";

        list.push({
          id: `comp-${comp.id}`,
          type: "complaint",
          title: `Complaint: ${siteName}`,
          subtitle: comp.description,
          details: comp.assigned_service_person_name
            ? `Assigned: ${comp.assigned_service_person_name}`
            : "Status: Unassigned",
          dueLabel: isCrit ? `${comp.priority} Priority` : "Open Complaint",
          urgency: isCrit ? "urgent" : "warning",
          path: `/${orgSlug}/dms/site-services/complaints`,
        });
      }
    });

    // 4. Request for Calls (show until completed or cancelled)
    calls.forEach((call) => {
      if (call.status === "PENDING") {
        list.push({
          id: `call-${call.id}`,
          type: "call",
          title: `Call Request: ${call.name || "Customer"}`,
          subtitle: call.message || call.subject || "Callback requested",
          details: `Phone: ${call.phone}`,
          dueLabel: "Call Pending",
          urgency: "urgent",
          path: `/${orgSlug}/dms/tech-support/calls`,
        });
      }
    });

    // Sort: urgent items first, then warnings, then info
    const priorityWeight: Record<string, number> = {
      urgent: 3,
      warning: 2,
      info: 1,
      normal: 0,
    };

    list.sort((a, b) => (priorityWeight[b.urgency] ?? 0) - (priorityWeight[a.urgency] ?? 0));

    return list;
  }, [enquiries, schedules, complaints, sites, calls, orgSlug]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.has(n.id)).length;
  }, [notifications, readIds]);

  return {
    notifications,
    unreadCount,
    readIds,
    markAsRead,
    markAllAsRead,
  };
}
