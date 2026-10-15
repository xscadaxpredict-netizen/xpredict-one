import { TableSkeleton } from "@xpredict/ui";
import { asProblem } from "@xpredict/api-client";
import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useSites, useWaterReports, useCreateWaterReport, useUpdateWaterReport, useDeleteWaterReport } from "../hooks/useSiteServices";
import { WaterReportTable } from "../components/WaterReportTable";
import { WaterReportModal } from "../components/WaterReportModal";
import { WaterReportViewModal } from "../components/WaterReportViewModal";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./WaterReportsScreen.module.css";
import { useDialog } from "../../shared/hooks/useDialog";

const INITIAL_FORM = {
  zonePincode: "",
  siteId: "",
  date: "",
  attachment: null as File | string | null,
  attachmentName: "",
  attachedItems: [] as any[],
  attachments: [] as any[],
};

export function WaterReportsScreen() {
  const { data: sites, isPending: sitesPending, isError: sitesError, error: sitesErrorObj } = useSites();
  const { data: reports, isPending: reportsPending, isError: reportsError, error: reportsErrorObj } = useWaterReports();
  const createReportMutation = useCreateWaterReport();
  const updateReportMutation = useUpdateWaterReport();
  const deleteReportMutation = useDeleteWaterReport();
  const { canCreateWaterReport } = useDmsPermissions();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const { showAlert, showConfirm, DialogComponent } = useDialog();

  if (sitesPending || reportsPending) return <TableSkeleton label="water reports" columns={[150, 150, 120, "grow"]} rows={4} />;
  if (sitesError) return <div style={{ padding: "var(--space-4)" }}>Error loading sites: {(sitesErrorObj as Error).message}</div>;
  if (reportsError) return <div style={{ padding: "var(--space-4)" }}>Error loading reports: {(reportsErrorObj as Error).message}</div>;

  const confirmedSites = sites || [];

  // Flatten reports, matching them to sites
  const allReports = (reports || []).map((r: any) => {
    const site = confirmedSites.find(s => s.id === r.site_id);
    return {
      ...r,
      date: r.date_tested || r.date || "",
      siteName: site?.customer_name || "Unknown",
      ocNumber: site?.oc_number || "",
    };
  }).filter((r) => {
    if (selectedSiteId && r.site_id !== selectedSiteId) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (r.siteName || "").toLowerCase().includes(query) ||
      (r.ocNumber || "").toLowerCase().includes(query)
    );
  });

  const openNewModal = () => {
    setEditingReport(null);
    setForm({
      ...INITIAL_FORM,
      date: new Date().toISOString().split("T")[0] || "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (report: any) => {
    setViewingReport(null);
    setEditingReport(report);
    const site = confirmedSites.find(s => s.id === (report.site_id || report.siteId));

    let existingItems: any[] = [];
    if (report.attachments && Array.isArray(report.attachments) && report.attachments.length > 0) {
      existingItems = report.attachments.map((att: any) => {
        const fileUrl = typeof att === "string" ? att : att.file;
        const fileName = att.file_name || (typeof fileUrl === "string" ? fileUrl.split("/").pop() || "file" : "file");
        const isImg = typeof fileUrl === "string" ? /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl) : false;
        return {
          id: att.id,
          file: fileUrl,
          name: fileName,
          previewUrl: isImg ? fileUrl : undefined,
          isImage: isImg,
        };
      });
    } else if (report.attachment) {
      const fileUrl = report.attachment;
      const fileName = report.attachment.split("/").pop() || "file";
      const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);
      existingItems = [{
        id: report.attachment_id || null,
        file: fileUrl,
        name: fileName,
        previewUrl: isImg ? fileUrl : undefined,
        isImage: isImg,
      }];
    }

    setForm({
      ...INITIAL_FORM,
      ...report,
      siteId: report.site_id || report.siteId || "",
      date: report.date_tested || report.date || "",
      zonePincode: site?.pincode || site?.address || "",
      attachedItems: existingItems,
      attachment: report.attachment || null,
      attachmentName: report.attachment ? report.attachment.split("/").pop() || "" : "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm("Delete Report", "Are you sure you want to delete this water report?")) {
      try {
        await deleteReportMutation.mutateAsync(id);
      } catch (e: any) {
        showAlert("Error", `Failed to delete water report: ${e.message}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.siteId) {
      showAlert("Error", "Please select a customer site!");
      return;
    }
    if (!form.date) {
      showAlert("Error", "Please enter the test date!");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("site_id", form.siteId);
      formData.append("date_tested", form.date);

      const attachedFiles = (form.attachedItems || [])
        .map((item: any) => item.file)
        .filter((f: any) => f instanceof File);

      const keptIds = (form.attachedItems || [])
        .filter((item: any) => item.id)
        .map((item: any) => item.id);
        
      keptIds.forEach((id: string) => formData.append("kept_attachment_ids", id));

      if (attachedFiles.length > 0) {
        attachedFiles.forEach((file: File) => {
          formData.append("attachments", file);
        });
        if (attachedFiles[0]) {
          formData.append("attachment", attachedFiles[0]);
        }
      } else if (form.attachments && Array.isArray(form.attachments)) {
        form.attachments.forEach((file: any) => {
          if (file instanceof File) {
            formData.append("attachments", file);
          }
        });
        if (form.attachments[0] instanceof File) {
          formData.append("attachment", form.attachments[0]);
        }
      } else if (form.attachment instanceof File) {
        formData.append("attachment", form.attachment);
        formData.append("attachments", form.attachment);
      }

      if (editingReport) {
        await updateReportMutation.mutateAsync({ reportId: editingReport.id, formData });
      } else {
        await createReportMutation.mutateAsync(formData);
      }
      setIsModalOpen(false);
    } catch (e: any) {
      const prob = asProblem(e);
      showAlert("Error", `Failed to save report: ${prob.detail || e.message}`);
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
          <div style={{ position: "relative", width: "250px" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="search" 
              placeholder="Search reports..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", height: "36px", padding: "0 10px 0 34px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
            />
          </div>
        </div>
        {canCreateWaterReport && (
          <button type="button" className={styles.btnPrimary} onClick={openNewModal}>
            <PlusIcon size={16} /> New Water Report
          </button>
        )}
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
      <DialogComponent />
    </div>
  );
}
