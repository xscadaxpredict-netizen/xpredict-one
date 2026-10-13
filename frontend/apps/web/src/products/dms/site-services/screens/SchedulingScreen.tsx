import { useState } from "react";
import { PlusIcon, ClockIcon, LayersIcon, SearchIcon } from "lucide-react";
import {
  useSites,
  useSchedules,
  useUpdateSiteProfile,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
} from "../hooks/useSiteServices";
import { ScheduleTable } from "../components/ScheduleTable";
import { ScheduleModal } from "../components/ScheduleModal";
import type { ScheduleEntry } from "../api/types";
import type { Enquiry } from "../../sales/api/types";
import styles from "./SchedulingScreen.module.css";
import { useDialog } from "../../shared/hooks/useDialog";

const INITIAL_SCHEDULE_FORM = {
  siteId: "",
  serviceType: "Routine Preventive Maintenance (PMS)",
  scheduledDate: "",
  serviceInterval: "30",
  technician: "",
  dcNumber: "",
  notes: "",
};

export function SchedulingScreen() {
  const [activeTab, setActiveTab] = useState<"visits" | "deployed">("deployed");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: sites, isPending: sitesPending, isError, error } = useSites();
  const { data: schedules, isPending: schedulesPending } = useSchedules(selectedSiteId);
  
  const updateProfileMutation = useUpdateSiteProfile();
  const createScheduleMutation = useCreateSchedule();
  const updateScheduleMutation = useUpdateSchedule();
  const deleteScheduleMutation = useDeleteSchedule();
  
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_SCHEDULE_FORM);

  const [viewingSchedule, setViewingSchedule] = useState<ScheduleEntry | null>(null);
  const { showAlert, showConfirm, DialogComponent } = useDialog();

  if (sitesPending || schedulesPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  const confirmedSites = sites || [];
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
    else if (field === "last_serviced_date") payload = { last_serviced_date: value };
    else if (field === "technician_display_name") payload = { technician_display_name: value };

    updateProfileMutation.mutate({ siteId, payload });
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (await showConfirm("Delete Schedule", "Delete this scheduled visit?")) {
      try {
        await deleteScheduleMutation.mutateAsync(scheduleId);
      } catch (e: any) {
        showAlert("Error", `Failed to delete schedule: ${e.message}`);
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
      technician: sch.technician_display_name || "",
      dcNumber: "",
      notes: sch.notes || "",
    });
    setIsScheduleModalOpen(true);
  };

  const handleScheduleSite = (site: Enquiry) => {
    setEditingScheduleId(null);
    setScheduleForm({
      ...INITIAL_SCHEDULE_FORM,
      siteId: site.id,
    });
    setIsScheduleModalOpen(true);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingScheduleId) {
        await updateScheduleMutation.mutateAsync({
          scheduleId: editingScheduleId,
          payload: {
            site_id: scheduleForm.siteId,
            service_type: scheduleForm.serviceType,
            scheduled_date: scheduleForm.scheduledDate,
            technician_display_name: scheduleForm.technician,
            notes: scheduleForm.notes,
            status: "SCHEDULED",
          },
        });
        showAlert("Success", "Schedule updated successfully!");
      } else {
        await createScheduleMutation.mutateAsync({
          site_id: scheduleForm.siteId,
          service_type: scheduleForm.serviceType,
          scheduled_date: scheduleForm.scheduledDate,
          technician_display_name: scheduleForm.technician,
          notes: scheduleForm.notes,
          status: "SCHEDULED",
        });
        showAlert("Success", "Schedule created successfully!");
      }
      setIsScheduleModalOpen(false);
    } catch (e: any) {
      showAlert("Error", `Failed to save schedule: ${e.message}`);
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
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "deployed" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("deployed")}
          >
            <LayersIcon size={16} />
            Deployed Sites & Maintenance Intervals
            <span className={styles.badgeCount}>{confirmedSites.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "visits" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("visits")}
          >
            <ClockIcon size={16} />
            Scheduled Visit Sub-Tab
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

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleOpenCreateModal}
          >
            <PlusIcon size={16} /> Schedule Service
          </button>
        </div>
      </div>

      <ScheduleTable
        activeTab={activeTab}
        sites={displaySites as any}
        schedules={currentSchedules}
        onUpdateSiteDetails={updateSiteDetails}
        onViewSchedule={(sch) => setViewingSchedule(sch)}
        onEditSchedule={handleOpenEditModal}
        onDeleteSchedule={handleDeleteSchedule}
        onScheduleSite={handleScheduleSite}
      />

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        form={scheduleForm}
        confirmedSites={confirmedSites as any}
        onFormChange={(updates) => setScheduleForm((prev) => ({ ...prev, ...updates }))}
        onSubmit={handleScheduleSubmit}
        onClose={() => setIsScheduleModalOpen(false)}
      />

      {viewingSchedule && (
        <div className={styles.modalOverlay} onClick={() => setViewingSchedule(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", padding: "24px", borderRadius: "8px", maxWidth: "500px", width: "90%" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.2rem", fontWeight: 700 }}>Scheduled Visit Details</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
              <div><strong>Scheduled Date:</strong> {viewingSchedule.scheduled_date}</div>
              <div><strong>Service Type:</strong> {viewingSchedule.service_type || "Routine Maintenance"}</div>
              <div><strong>Technician:</strong> {viewingSchedule.technician_display_name || "Unassigned"}</div>
              <div><strong>Status:</strong> {viewingSchedule.status}</div>
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
            </div>
          </div>
        </div>
      )}
      <DialogComponent />
    </div>
  );
}
