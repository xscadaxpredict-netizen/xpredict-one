import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useSites, useUpdateSiteProfile, useCreateSchedule } from "../hooks/useSiteServices";
import { ScheduleTable } from "../components/ScheduleTable";
import { ScheduleModal } from "../components/ScheduleModal";
import styles from "./SchedulingScreen.module.css";

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
  const { data: sites, isPending, isError, error } = useSites();
  const updateProfileMutation = useUpdateSiteProfile();
  const createScheduleMutation = useCreateSchedule();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_SCHEDULE_FORM);

  if (isPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  // Filter for confirmed sites
  const confirmedSites = sites || [];
  const displaySites = selectedSiteId
    ? confirmedSites.filter((s) => s.id === selectedSiteId)
    : confirmedSites;

  const updateSiteDetails = (siteId: string, field: string, value: string) => {
    let payload = {};
    if (field === "dc_number") payload = { dc_number: value };
    else if (field === "service_type") payload = { service_type: value };
    else if (field === "service_interval_days") payload = { service_interval_days: parseInt(value, 10) || null };
    else if (field === "last_serviced_date") payload = { last_serviced_date: value };
    else if (field === "technician_display_name") payload = { technician_display_name: value };

    updateProfileMutation.mutate({ siteId, payload });
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createScheduleMutation.mutateAsync({
        site_id: scheduleForm.siteId,
        service_type: scheduleForm.serviceType,
        scheduled_date: scheduleForm.scheduledDate,
        technician_display_name: scheduleForm.technician,
        notes: scheduleForm.notes,
        status: "SCHEDULED"
      });
      setIsScheduleModalOpen(false);
      alert("Schedule saved!");
    } catch (e: any) {
      alert(`Failed to save schedule: ${e.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.actionBar}>
        <div className={styles.filterGroup}>
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
        </div>

        <button type="button" className={styles.btnPrimary} onClick={() => { setScheduleForm(INITIAL_SCHEDULE_FORM); setIsScheduleModalOpen(true); }}>
          <PlusIcon size={16} /> Schedule Service
        </button>
      </div>

      <ScheduleTable 
        sites={displaySites}
        onUpdateSiteDetails={updateSiteDetails}
      />

      <ScheduleModal 
        isOpen={isScheduleModalOpen}
        form={scheduleForm}
        confirmedSites={confirmedSites as any} // we might need to adjust types in components later

        onFormChange={(updates) => setScheduleForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleScheduleSubmit}
        onClose={() => setIsScheduleModalOpen(false)}
      />
    </div>
  );
}
