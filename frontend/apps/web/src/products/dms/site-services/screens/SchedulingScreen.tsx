import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon, ClockIcon, LayersIcon, SearchIcon } from "lucide-react";
import {
  useSites,
  useSchedules,
  useUpdateSiteProfile,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useScheduleDependencies,
  useCancelVisit,
  useRescheduleVisit,
} from "../hooks/useSiteServices";
import { visitHistoryLines } from "../components/visitStatus";
import { useShellContext } from "../../../../shell/context";
import { apiErrorMessage } from "../../shared/api/errorMessage";
import { VisitStatusBadge } from "../components/VisitActions";
import { ScheduleTable } from "../components/ScheduleTable";
import { ScheduleModal } from "../components/ScheduleModal";
import type { ConfirmedSite, ScheduleEntry } from "../api/types";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./SchedulingScreen.module.css";
import { useDialog } from "../../shared/hooks/useDialog";
import { formatDate } from "../../shared/format/date";
import { planScheduleDelete } from "../../shared/deleteChecks";

const INITIAL_SCHEDULE_FORM = {
  siteId: "",
  serviceType: "Routine Preventive Maintenance (PMS)",
  scheduledDate: "",
  serviceInterval: "30",
  technicianUserId: "",
  technicianName: "",
  legacyTechnician: "",
  lockSite: false,
  mode: "create" as "create" | "edit" | "reschedule",
  dcNumber: "",
  notes: "",
};

export function SchedulingScreen() {
  const { canScheduleService, canEditSchedule } = useDmsPermissions();
  // MANAGERS RUN THE SCHEDULE; everybody else sees the visits assigned to
  // them (the server filters the list the same way) and starts with those.
  const canManage = canScheduleService || canEditSchedule;
  const { me } = useShellContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"visits" | "deployed">(canManage ? "deployed" : "visits");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: sites, isPending: sitesPending, isError, error } = useSites();
  const { data: schedules, isPending: schedulesPending } = useSchedules(selectedSiteId);
  const cancelVisit = useCancelVisit();
  const rescheduleVisit = useRescheduleVisit();
  
  const updateProfileMutation = useUpdateSiteProfile();
  const createScheduleMutation = useCreateSchedule();
  const updateScheduleMutation = useUpdateSchedule();
  const deleteScheduleMutation = useDeleteSchedule();
  const scheduleDependencies = useScheduleDependencies();
  
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_SCHEDULE_FORM);

  const [viewingSchedule, setViewingSchedule] = useState<ScheduleEntry | null>(null);
  const { showAlert, showConfirm, showPrompt, DialogComponent } = useDialog();

  // ---- Visit actions -------------------------------------------------------
  // The same visit, back on the schedule: prefilled, only the date (and, if
  // needed, the technician) to choose.
  const handleRescheduleVisit = (visit: ScheduleEntry) => {
    setEditingScheduleId(visit.id);
    setScheduleForm({
      ...INITIAL_SCHEDULE_FORM,
      siteId: visit.site_id,
      serviceType: visit.service_type || INITIAL_SCHEDULE_FORM.serviceType,
      scheduledDate: "",
      technicianUserId: visit.technician_user_id || "",
      technicianName: visit.technician_display_name || "",
      notes: visit.notes || "",
      lockSite: true,
      mode: "reschedule",
    });
    setIsScheduleModalOpen(true);
  };

  const handleCancelVisit = async (visit: ScheduleEntry) => {
    const reason = await showPrompt(
      "Cancel this visit?",
      `It stays in the history as cancelled. Why is the ${formatDate(visit.scheduled_date)} visit being cancelled?`,
    );
    if (reason === null) return;
    try {
      await cancelVisit.mutateAsync({ scheduleId: visit.id, reason });
    } catch (err) {
      void showAlert("Visit not cancelled", apiErrorMessage(err, "The visit could not be cancelled."));
    }
  };

  // The report is filed on the Service Reports page, opened for THIS visit:
  // its client signature is what completes the visit.
  const handleFileReport = (visit: ScheduleEntry) => navigate(`../reports?visit=${visit.id}`);
  const handleOpenReport = (visit: ScheduleEntry) =>
    visit.report_id && navigate(`../reports?report=${visit.report_id}`);

  if (sitesPending || schedulesPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  // MAINTENANCE IS AN AMC SERVICE. A deployed site enters this list only once
  // an AMC quote for it is confirmed; until then it is on the AMC tab, waiting
  // for one. No AMC, no scheduled service.
  const confirmedSites = (sites || []).filter((s) =>
    (s.quotes || []).some((q) => q.type === "AMC" && q.status === "CONFIRMED"),
  );
  const displaySites = confirmedSites.filter((s) => {
    if (selectedSiteId && s.id !== selectedSiteId) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (s.customer_name?.toLowerCase().includes(query) || s.oc_number?.toLowerCase().includes(query));
  });

  const updateSiteDetails = (siteId: string, field: string, value: string) => {
    let payload = {};
    if (field === "dc_number") payload = { dc_number: value };
    else if (field === "service_type") payload = { service_type: value };
    else if (field === "service_interval_days") payload = { service_interval_days: parseInt(value, 10) || null };
    // A cleared date is null to the API; "" is rejected as an invalid date.
    else if (field === "last_serviced_date") payload = { last_serviced_date: value || null };
    else if (field === "technician_display_name") payload = { technician_display_name: value };

    updateProfileMutation.mutate({ siteId, payload });
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    let plan;
    try {
      plan = planScheduleDelete(await scheduleDependencies.mutateAsync(scheduleId));
    } catch (e: any) {
      void showAlert("Error", `Could not check this visit before deleting: ${e.message}`);
      return;
    }
    if (await showConfirm("Delete Scheduled Visit", plan.message)) {
      try {
        await deleteScheduleMutation.mutateAsync({ scheduleId, confirm: plan.confirm });
      } catch (e: any) {
        void showAlert("Error", `Failed to delete schedule: ${e.message}`);
      }
    }
  };

  const handleOpenCreateModal = () => {
    setEditingScheduleId(null);
    setScheduleForm(INITIAL_SCHEDULE_FORM);
    setIsScheduleModalOpen(true);
  };

  const handleOpenEditModal = (sch: ScheduleEntry) => {
    setEditingScheduleId(sch.id);
    setScheduleForm({
      siteId: sch.site_id,
      serviceType: sch.service_type || "Routine Preventive Maintenance (PMS)",
      scheduledDate: sch.scheduled_date || "",
      serviceInterval: "30",
      technicianUserId: sch.technician_user_id || "",
      technicianName: sch.technician_display_name || "",
      // A name typed before technicians were people: shown as a hint only.
      legacyTechnician: sch.technician_user_id ? "" : sch.technician_display_name || "",
      lockSite: true,
      mode: "edit",
      dcNumber: "",
      notes: sch.notes || "",
    });
    setIsScheduleModalOpen(true);
  };

  const handleScheduleSite = (site: ConfirmedSite) => {
    setEditingScheduleId(null);
    setScheduleForm({
      ...INITIAL_SCHEDULE_FORM,
      siteId: site.id,
      lockSite: true,
    });
    setIsScheduleModalOpen(true);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingScheduleId && scheduleForm.mode === "reschedule") {
        await rescheduleVisit.mutateAsync({
          scheduleId: editingScheduleId,
          payload: {
            scheduled_date: scheduleForm.scheduledDate,
            technician_user_id: scheduleForm.technicianUserId || null,
          },
        });
      } else if (editingScheduleId) {
        await updateScheduleMutation.mutateAsync({
          scheduleId: editingScheduleId,
          payload: {
            service_type: scheduleForm.serviceType,
            scheduled_date: scheduleForm.scheduledDate,
            technician_user_id: scheduleForm.technicianUserId || null,
            notes: scheduleForm.notes,
          },
        });
      } else {
        await createScheduleMutation.mutateAsync({
          site_id: scheduleForm.siteId,
          service_type: scheduleForm.serviceType,
          scheduled_date: scheduleForm.scheduledDate,
          technician_user_id: scheduleForm.technicianUserId || null,
          notes: scheduleForm.notes,
        });
      }
      setIsScheduleModalOpen(false);
    } catch (err) {
      void showAlert("Visit not saved", apiErrorMessage(err, "The visit could not be saved."));
    }
  };

  const currentSchedules = (schedules || []).filter(sch => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (sch.service_type || "").toLowerCase().includes(query) ||
      (sch.technician_display_name || "").toLowerCase().includes(query) ||
      (sch.notes || "").toLowerCase().includes(query) ||
      (sch.status || "").toLowerCase().includes(query)
    );
  });

  return (
    <div className={styles.container}>
      <div className={styles.actionBar}>
        <div className={styles.tabsBar}>
          {canManage && (
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "deployed" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("deployed")}
            >
              <LayersIcon size={16} />
              Deployed Sites & Maintenance Intervals
              <span className={styles.badgeCount}>{confirmedSites.length}</span>
            </button>
          )}
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "visits" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("visits")}
          >
            <ClockIcon size={16} />
            {canManage ? "Scheduled Visits" : "My Visits"}
            <span className={styles.badgeCount}>{currentSchedules.length}</span>
          </button>
        </div>

        <div className={styles.filterGroup} style={{ justifyContent: "flex-end" }}>
          <select
            className={styles.siteSelect}
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
          >
            <option value="">All Deployed Sites ({confirmedSites.length})</option>
            {confirmedSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.customer_name} ({s.oc_number || "No OC"})
              </option>
            ))}
          </select>

          <div style={{ position: "relative", width: "250px", marginLeft: "10px" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="search" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", height: "36px", padding: "0 10px 0 34px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
            />
          </div>

          {canScheduleService && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleOpenCreateModal}
            >
              <PlusIcon size={16} /> Schedule Service
            </button>
          )}
        </div>
      </div>

      <ScheduleTable
        activeTab={activeTab}
        sites={displaySites}
        schedules={currentSchedules}
        onUpdateSiteDetails={updateSiteDetails}
        onViewSchedule={(sch) => setViewingSchedule(sch)}
        onEditSchedule={handleOpenEditModal}
        onDeleteSchedule={(arg) => void handleDeleteSchedule(arg)}
        onScheduleSite={handleScheduleSite}
        onCancelVisit={(arg) => void handleCancelVisit(arg)}
        onRescheduleVisit={handleRescheduleVisit}
        onFileReport={(arg) => void handleFileReport(arg)}
        onOpenReport={(arg) => void handleOpenReport(arg)}
        currentUserId={me.id}
        canManage={canManage}
      />

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        form={scheduleForm}
        confirmedSites={confirmedSites as any}
        onFormChange={(updates) => setScheduleForm((prev) => ({ ...prev, ...updates }))}
        onSubmit={(e) => void handleScheduleSubmit(e)}
        onClose={() => setIsScheduleModalOpen(false)}
      />

      {viewingSchedule && (
        <div className={styles.modalOverlay} onClick={() => setViewingSchedule(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", padding: "24px", borderRadius: "8px", maxWidth: "500px", width: "90%" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.2rem", fontWeight: 700 }}>Scheduled Visit Details</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
              <div><strong>Scheduled Date:</strong> {formatDate(viewingSchedule.scheduled_date)}</div>
              <div><strong>Service Type:</strong> {viewingSchedule.service_type || "Routine Maintenance"}</div>
              <div><strong>Technician:</strong> {viewingSchedule.technician_display_name || "Unassigned"}</div>
              <div><strong>Status:</strong> <VisitStatusBadge visit={viewingSchedule} /></div>
              {viewingSchedule.cancel_reason && (
                <div><strong>Cancellation reason:</strong> {viewingSchedule.cancel_reason}</div>
              )}
              {visitHistoryLines(viewingSchedule).length > 0 && (
                <div>
                  <strong>History:</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                    {visitHistoryLines(viewingSchedule).map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </div>
              )}
              <div><strong>Notes:</strong> {viewingSchedule.notes || "—"}</div>
            </div>
            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className={styles.btnSmallSecondary}
                onClick={() => setViewingSchedule(null)}
              >
                Close
              </button>
              {canEditSchedule && viewingSchedule.status !== "COMPLETED" && viewingSchedule.status !== "CANCELLED" && (
                <button
                  type="button"
                  className={styles.btnSmallPrimary}
                  onClick={() => {
                    const sch = viewingSchedule;
                    setViewingSchedule(null);
                    handleOpenEditModal(sch);
                  }}
                >
                  Edit Schedule
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <DialogComponent />
    </div>
  );
}
