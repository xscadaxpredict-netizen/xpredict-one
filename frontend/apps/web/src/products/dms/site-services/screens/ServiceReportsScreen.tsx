import { useState } from "react";
import { useParams } from "react-router-dom";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useSites, useServiceReports, useCreateServiceReport, useUpdateServiceReport, useDeleteServiceReport } from "../hooks/useSiteServices";
import { ServiceReportTable } from "../components/ServiceReportTable";
import { ServiceReportModal } from "../components/ServiceReportModal";
import { ReportViewModal } from "../components/ReportViewModal";
import { ShareLinkModal } from "../components/ShareLinkModal";
import styles from "./ServiceReportsScreen.module.css";
import { TableSkeleton } from "@xpredict/ui";
import { useDialog } from "../../shared/hooks/useDialog";

const INITIAL_FORM = {
  zonePincode: "", siteId: "", technician: "", date: "", zone: "North Zone", customZone: "", remarks: "", servicePersonName: "", servicePersonSignature: "", clientName: "", clientSignature: "", existingAttachments: []
};

export function ServiceReportsScreen() {
  const { data: sites, isPending: sitesPending, isError: sitesError, error } = useSites();
  const { data: reports, isPending: reportsPending, refetch: refetchReports, isFetching: isRefetching } = useServiceReports();
  const createReportMutation = useCreateServiceReport();
  const updateReportMutation = useUpdateServiceReport();
  const deleteReportMutation = useDeleteServiceReport();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [shareLink, setShareLink] = useState<{isOpen: boolean, url: string}>({ isOpen: false, url: "" });
  const [form, setForm] = useState<any>(INITIAL_FORM);
  const { showAlert, showConfirm, showPrompt, DialogComponent } = useDialog();

  const { orgSlug } = useParams<{ orgSlug: string }>();

  if (sitesPending || reportsPending) {
    return (
      <div style={{ padding: "var(--space-4)" }}>
        <TableSkeleton columns={[100, 150, 120, "grow", 120, 100]} label="service reports" />
      </div>
    );
  }
  if (sitesError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  const handleShare = (report: any) => {
    if (!report.sign_link_token) {
      showAlert("Error", "This report does not have a signature token. Try editing and saving it again.");
      return;
    }
    const publicUrl = `${window.location.protocol}//${window.location.host}/public/report/${orgSlug}/${report.sign_link_token}`;
    setShareLink({ isOpen: true, url: publicUrl });
  };

  const confirmedSites = sites || [];

  // Flatten reports, matching them to sites
  const allReports = (reports || []).map((r) => {
    const site = confirmedSites.find(s => s.id === r.site_id);
    return {
      ...r,
      siteName: site?.customer_name || "Unknown Site",
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
    
    const standardZones = ["North Zone", "South Zone", "East Zone", "West Zone", "Central Zone"];
    const backendZone = report.zone || "North Zone";
    const isStandardZone = standardZones.includes(backendZone);

    const site = confirmedSites.find(s => s.id === (report.site_id || report.siteId));

    setForm({
      ...INITIAL_FORM,
      siteId: report.site_id || "",
      zonePincode: site?.pincode || site?.address || "",
      date: report.service_date || "",
      zone: isStandardZone ? backendZone : "Other",
      customZone: isStandardZone ? "" : backendZone,
      technician: report.technician_display_name || "",
      remarks: report.remarks || "",
      servicePersonName: report.service_person_name || report.technician_display_name || "",
      servicePersonSignature: report.service_person_signature || "",
      clientName: report.client_name || "",
      clientSignature: report.client_signature || "",
      existingAttachments: report.attachments || []
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent, files?: FileList | null) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("site_id", form.siteId);
      formData.append("service_date", form.date);
      formData.append("zone", form.zone === "Other" ? form.customZone : form.zone);
      formData.append("technician_display_name", form.technician);
      formData.append("remarks", form.remarks);
      formData.append("service_person_name", form.servicePersonName || form.technician);
      if (form.servicePersonSignature && form.servicePersonSignature.startsWith("data:image")) {
        formData.append("service_person_signature", form.servicePersonSignature);
      }
      if (form.clientName) formData.append("client_name", form.clientName);
      if (form.clientSignature && form.clientSignature.startsWith("data:image")) {
        formData.append("client_signature", form.clientSignature);
      }

      if (form.attachments && Array.isArray(form.attachments)) {
        form.attachments.forEach((file: any) => {
          if (file instanceof File) {
            formData.append("attachments", file);
          }
        });
      }

      if (files && files.length > 0) {
        Array.from(files).forEach((file) => {
          formData.append("attachments", file);
        });
      }

      if (editingReport) {
        if (form.existingAttachments) {
          form.existingAttachments.forEach((att: any) => {
            if (att.id) formData.append("kept_attachment_ids", att.id);
          });
        }
        
        formData.append("client_approval_status", "PENDING");
        formData.append("approval_remarks", "");
        await updateReportMutation.mutateAsync({ reportId: editingReport.id, payload: formData });
        showAlert("Success", "Service Report Updated!");
      } else {
        await createReportMutation.mutateAsync(formData);
        showAlert("Success", "Service Report Logged!");
      }
      setIsModalOpen(false);
    } catch (e: any) {
      showAlert("Error", `Failed to save report: ${e.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await showConfirm("Delete Report", "Are you sure you want to delete this service report?");
    if(isConfirmed) {
      try {
        await deleteReportMutation.mutateAsync(id);
        showAlert("Success", 'Service report deleted successfully!');
      } catch (e: any) {
        showAlert("Error", `Failed to delete report: ${e.message}`);
      }
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
          <input
            type="text"
            className={styles.input}
            placeholder="Search report, tech..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            type="button" 
            className={styles.btnSecondary} 
            onClick={() => refetchReports()}
            disabled={isRefetching}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCwIcon size={16} className={isRefetching ? styles.spin : ""} /> Refresh
          </button>
          <button type="button" className={styles.btnPrimary} onClick={openNewModal}>
            <PlusIcon size={16} /> New Report
          </button>
        </div>
      </div>

      <ServiceReportTable 
        reports={filteredReports}
        onView={setViewingReport}
        onEdit={openEditModal}
        onDelete={handleDelete}
        onShare={handleShare}
      />

      <ServiceReportModal 
        isOpen={isModalOpen}
        isEditing={!!editingReport}
        form={form}
        confirmedSites={confirmedSites as any}
        onFormChange={(updates) => setForm((prev: any) => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />

      <ReportViewModal 
        isOpen={!!viewingReport}
        report={viewingReport}
        onEdit={() => openEditModal(viewingReport)}
        onClose={() => setViewingReport(null)}
        onApprove={async (id, remarks) => {
          try {
            await updateReportMutation.mutateAsync({
              reportId: id,
              payload: { client_approval_status: "APPROVED", approval_remarks: remarks }
            });
            showAlert("Success", "Report approved!");
            setViewingReport(null);
          } catch (err: any) {
            showAlert("Error", `Failed to approve: ${err.message}`);
          }
        }}
        onReject={async (id, remarks) => {
          try {
            await updateReportMutation.mutateAsync({
              reportId: id,
              payload: { client_approval_status: "REJECTED", approval_remarks: remarks }
            });
            showAlert("Success", "Report rejected!");
            setViewingReport(null);
          } catch (err: any) {
            showAlert("Error", `Failed to reject: ${err.message}`);
          }
        }}
      />
      
      <ShareLinkModal 
        isOpen={shareLink.isOpen} 
        link={shareLink.url} 
        onClose={() => setShareLink({ isOpen: false, url: "" })} 
      />

      <DialogComponent />
    </div>
  );
}
