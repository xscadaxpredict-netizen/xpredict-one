import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import { useSites, useComplaints, useCreateComplaint } from "../hooks/useSiteServices";
import { ComplaintTable } from "../components/ComplaintTable";
import { ComplaintModal } from "../components/ComplaintModal";
import { ComplaintViewModal } from "../components/ComplaintViewModal";

import styles from "./ComplaintsScreen.module.css";

const INITIAL_FORM = {
  zonePincode: "",
  siteId: "",
  servicePersonName: "",
  date: "",
  issue: "",
};

export function ComplaintsScreen() {
  const { data: sites, isPending: sitesPending, isError: sitesError, error } = useSites();
  const { data: reports, isPending: reportsPending } = useComplaints();
  const createComplaintMutation = useCreateComplaint();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [deleteData, setDeleteData] = useState<any>(null);
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
    setForm({ ...INITIAL_FORM, date: new Date().toISOString().split("T")[0] || "" });
    setIsModalOpen(true);
  };

  const openEditModal = (report: any) => {
    setViewingReport(null);
    setEditingReport(report);
    setForm({
      ...INITIAL_FORM,
      ...report,
      siteId: report.siteId || "",
      servicePersonName: report.servicePersonName || report.personName || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("site_id", form.siteId);
      formData.append("description", form.issue);
      formData.append("priority", "MEDIUM"); // Default or add to form
      formData.append("status", "OPEN");

      await createComplaintMutation.mutateAsync(formData);
      setIsModalOpen(false);
      alert("Complaint Logged!");
    } catch (e: any) {
      alert(`Failed to save complaint: ${e.message}`);
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
        <button type="button" className={styles.btnDanger} onClick={openNewModal}>
          <PlusIcon size={16} /> Log Complaint
        </button>
      </div>

      <ComplaintTable 
        reports={allReports}
        onView={setViewingReport}
        onEdit={openEditModal}
        onDelete={setDeleteData}
      />

      <ComplaintModal 
        isOpen={isModalOpen}
        isEditing={!!editingReport}
        form={form}
        confirmedSites={confirmedSites as any}
        onFormChange={(updates) => setForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />

      <ComplaintViewModal 
        isOpen={!!viewingReport}
        report={viewingReport}
        onEdit={() => openEditModal(viewingReport)}
        onClose={() => setViewingReport(null)}
      />

      <ConfirmDeleteModal 
        isOpen={!!deleteData} 
        onCancel={() => setDeleteData(null)} 
        onConfirm={() => { if(deleteData) alert('Complaint Deleted!'); setDeleteData(null); }} 
      />
    </div>
  );
}
