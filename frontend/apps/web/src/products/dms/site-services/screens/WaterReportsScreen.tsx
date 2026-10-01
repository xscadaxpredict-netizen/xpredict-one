import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useEnquiries } from "../../sales/hooks/useEnquiries";
import { WaterReportTable } from "../components/WaterReportTable";
import { WaterReportModal } from "../components/WaterReportModal";
import { WaterReportViewModal } from "../components/WaterReportViewModal";
import styles from "./WaterReportsScreen.module.css";

const INITIAL_FORM = { zonePincode: "", siteId: "", date: "", attachment: "" };

export function WaterReportsScreen() {
  const { data: enquiries, isPending, isError, error } = useEnquiries();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  if (isPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  const confirmedSites = (enquiries || []).filter((e) => e.status === "CONFIRMED");
  const displaySites = selectedSiteId
    ? confirmedSites.filter((s) => s.id === selectedSiteId)
    : confirmedSites;

  // Flatten reports
  const allReports = displaySites.flatMap((s) =>
    (s.water_reports || []).map((r) => ({
      ...r,
      siteName: s.customer_name,
      ocNumber: s.oc_number,
    }))
  );

  const openNewModal = () => {
    setEditingReport(null);
    setForm(INITIAL_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (report: any) => {
    setViewingReport(null);
    setEditingReport(report);
    setForm({
      ...INITIAL_FORM,
      ...report,
      siteId: report.siteId || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = (_id: string) => {
    if(confirm('Delete this water report?')) alert('Deleted!');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    alert("Water Report Logged!");
  };

  return (
    <div className={styles.container}>
      <div className={styles.actionBar}>
        <div className={styles.filterGroup}>
          <select
            className={styles.select}
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
        <button type="button" className={styles.btnPrimary} onClick={openNewModal}>
          <PlusIcon size={16} /> New Water Report
        </button>
      </div>

      <WaterReportTable 
        reports={allReports}
        onView={setViewingReport}
        onEdit={openEditModal}
        onDelete={handleDelete}
      />

      <WaterReportModal 
        isOpen={isModalOpen}
        isEditing={!!editingReport}
        form={form}
        confirmedSites={confirmedSites}
        onFormChange={(updates) => setForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />

      <WaterReportViewModal 
        isOpen={!!viewingReport}
        report={viewingReport}
        onEdit={() => openEditModal(viewingReport)}
        onClose={() => setViewingReport(null)}
      />
    </div>
  );
}
