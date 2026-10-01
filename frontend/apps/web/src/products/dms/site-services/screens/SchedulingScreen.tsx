import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useEnquiries } from "../../sales/hooks/useEnquiries";
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
  const { data: enquiries, isPending, isError, error } = useEnquiries();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_SCHEDULE_FORM);

  if (isPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  // Filter for confirmed sites
  const confirmedSites = (enquiries || []).filter((e) => e.status === "CONFIRMED");
  const displaySites = selectedSiteId
    ? confirmedSites.filter((s) => s.id === selectedSiteId)
    : confirmedSites;

  const updateSiteDetails = (siteId: string, field: string, value: string) => {
    // In a real app, this would dispatch a mutation (e.g. useUpdateSiteDetails().mutate(...))
    console.log(`Updating ${field} to ${value} for site ${siteId}`);
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsScheduleModalOpen(false);
    alert("Schedule saved!");
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
        confirmedSites={confirmedSites}
        onFormChange={(updates) => setScheduleForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleScheduleSubmit}
        onClose={() => setIsScheduleModalOpen(false)}
      />
    </div>
  );
}
