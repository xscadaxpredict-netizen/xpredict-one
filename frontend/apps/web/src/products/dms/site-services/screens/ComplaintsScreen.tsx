import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import { useEnquiries } from "../../sales/hooks/useEnquiries";
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
  const { data: enquiries, isPending, isError, error } = useEnquiries();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [deleteData, setDeleteData] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  if (isPending) return <div style={{ padding: "var(--space-4)" }}>Loading...</div>;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  const confirmedSites = (enquiries || []).filter((e) => e.status === "CONFIRMED");
  const displaySites = selectedSiteId
    ? confirmedSites.filter((s) => s.id === selectedSiteId)
    : confirmedSites;

  // Flatten reports
  const allReports = displaySites.flatMap((s) =>
    (s.complaints || []).map((r) => ({
      ...r,
      siteName: s.customer_name,
      ocNumber: s.oc_number,
    }))
  );

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    alert("Complaint Logged!");
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
        confirmedSites={confirmedSites}
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
