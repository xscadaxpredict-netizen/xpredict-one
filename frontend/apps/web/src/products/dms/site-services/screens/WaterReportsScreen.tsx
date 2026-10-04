import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useSites, useWaterReports, useCreateWaterReport } from "../hooks/useSiteServices";
import { WaterReportTable } from "../components/WaterReportTable";
import { WaterReportModal } from "../components/WaterReportModal";
import { WaterReportViewModal } from "../components/WaterReportViewModal";
import styles from "./WaterReportsScreen.module.css";

const INITIAL_FORM = { zonePincode: "", siteId: "", date: "", attachment: "" };

export function WaterReportsScreen() {
  const { data: sites, isPending: sitesPending, isError: sitesError, error } = useSites();
  const { data: reports, isPending: reportsPending } = useWaterReports();
  const createReportMutation = useCreateWaterReport();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  if (sitesPending || reportsPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (sitesError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  const confirmedSites = sites || [];
  const displaySites = selectedSiteId
    ? confirmedSites.filter((s) => s.id === selectedSiteId)
    : confirmedSites;

  // Flatten reports, matching them to sites
  const allReports = (reports || []).map((r) => {
    const site = confirmedSites.find(s => s.id === r.site_id);
    return {
      ...r,
      siteName: site?.customer_name || "Unknown",
      ocNumber: site?.oc_number || "",
    };
  }).filter((r) => !selectedSiteId || r.site_id === selectedSiteId);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("site_id", form.siteId);
      formData.append("date_tested", form.date);
      if (form.attachment) formData.append("attachment", form.attachment);

      await createReportMutation.mutateAsync(formData);
      setIsModalOpen(false);
      alert("Water Report Logged!");
    } catch (e: any) {
      alert(`Failed to save report: ${e.message}`);
    }
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
        confirmedSites={confirmedSites as any}
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
