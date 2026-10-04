import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useSites, useServiceReports, useCreateServiceReport } from "../hooks/useSiteServices";
import { ServiceReportTable } from "../components/ServiceReportTable";
import { ServiceReportModal } from "../components/ServiceReportModal";
import { ReportViewModal } from "../components/ReportViewModal";
import styles from "./ServiceReportsScreen.module.css";

const INITIAL_FORM = {
  zonePincode: "", siteId: "", technician: "", date: "", zone: "North Zone", customZone: "", remarks: "", servicePersonName: "", servicePersonSignature: "", clientName: "", clientSignature: ""
};

export function ServiceReportsScreen() {
  const { data: sites, isPending: sitesPending, isError: sitesError, error } = useSites();
  const { data: reports, isPending: reportsPending } = useServiceReports();
  const createReportMutation = useCreateServiceReport();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
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
  });

  const filteredReports = allReports.filter(
    (r) =>
      (!selectedSiteId || r.site_id === selectedSiteId) &&
      (r.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
       (r.report_code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
       (r.technician_display_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("site_id", form.siteId);
      formData.append("service_date", form.date);
      formData.append("zone", form.zone === "Other" ? form.customZone : form.zone);
      formData.append("technician_display_name", form.technician);
      formData.append("remarks", form.remarks);
      formData.append("service_person_name", form.servicePersonName);
      formData.append("service_person_signature", form.servicePersonSignature);
      formData.append("client_name", form.clientName);
      formData.append("client_signature", form.clientSignature);

      await createReportMutation.mutateAsync(formData);
      setIsModalOpen(false);
      alert("Service Report Logged!");
    } catch (e: any) {
      alert(`Failed to save report: ${e.message}`);
    }
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
        confirmedSites={confirmedSites as any}
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
