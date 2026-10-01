import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useEnquiries } from "../../sales/hooks/useEnquiries";
import { ServiceReportTable } from "../components/ServiceReportTable";
import { ServiceReportModal } from "../components/ServiceReportModal";
import { ReportViewModal } from "../components/ReportViewModal";
import styles from "./ServiceReportsScreen.module.css";

const INITIAL_FORM = {
  zonePincode: "", siteId: "", technician: "", date: "", zone: "North Zone", customZone: "", remarks: "", servicePersonName: "", servicePersonSignature: "", clientName: "", clientSignature: ""
};

export function ServiceReportsScreen() {
  const { data: enquiries, isPending, isError, error } = useEnquiries();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
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
    (s.service_reports || []).map((r) => ({
      ...r,
      siteName: s.customer_name,
      ocNumber: s.oc_number,
    }))
  );

  const filteredReports = allReports.filter(
    (r) =>
      r.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.report_code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.technician.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    alert("Service Report Logged!");
  };

  const handleDelete = (_id: string) => {
    if(confirm('Delete this service report?')) alert('Deleted!');
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
          <input
            type="text"
            className={styles.input}
            placeholder="Search report, tech..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button type="button" className={styles.btnPrimary} onClick={openNewModal}>
          <PlusIcon size={16} /> New Report
        </button>
      </div>

      <ServiceReportTable 
        reports={filteredReports}
        onView={setViewingReport}
        onEdit={openEditModal}
        onDelete={handleDelete}
      />

      <ServiceReportModal 
        isOpen={isModalOpen}
        isEditing={!!editingReport}
        form={form}
        confirmedSites={confirmedSites}
        onFormChange={(updates) => setForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />

      <ReportViewModal 
        isOpen={!!viewingReport}
        report={viewingReport}
        onEdit={() => openEditModal(viewingReport)}
        onClose={() => setViewingReport(null)}
      />
    </div>
  );
}
