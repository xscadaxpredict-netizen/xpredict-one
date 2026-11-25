import { TableSkeleton } from "@xpredict/ui";
import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useSites, useComplaints, useCreateComplaint, useUpdateComplaint, useDeleteComplaint, useSetComplaintStatus } from "../hooks/useSiteServices";
import { useShellContext } from "../../../../shell/context";
import { apiErrorMessage } from "../../shared/api/errorMessage";
import type { ComplaintMove } from "../components/ComplaintActions";
import { ComplaintTable } from "../components/ComplaintTable";
import { ComplaintModal } from "../components/ComplaintModal";
import { ComplaintViewModal } from "../components/ComplaintViewModal";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./ComplaintsScreen.module.css";
import { useDialog } from "../../shared/hooks/useDialog";

const INITIAL_FORM = {
  siteId: "",
  servicePersonName: "",
  assignedUserId: "",
  legacyAssignee: "",
  priority: "MEDIUM",
  date: "",
  issue: "",
  attachment: null as File | string | null,
  attachmentName: "",
  attachedItems: [] as any[],
  attachments: [] as any[],
};

export function ComplaintsScreen() {
  const { data: sites, isPending: sitesPending, isError: sitesError, error: sitesErrorObj } = useSites();
  const { data: reports, isPending: reportsPending, isError: reportsError, error: reportsErrorObj } = useComplaints();
  const createComplaintMutation = useCreateComplaint();
  const updateComplaintMutation = useUpdateComplaint();
  const deleteComplaintMutation = useDeleteComplaint();
  const { canCreateComplaint, canManageComplaints } = useDmsPermissions();
  const setStatus = useSetComplaintStatus();
  const { me } = useShellContext();

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const { showAlert, showConfirm, showPrompt, DialogComponent } = useDialog();

  if (sitesPending || reportsPending) return <TableSkeleton label="complaints" columns={[150, 150, 120, "grow"]} rows={4} />;
  if (sitesError) return <div style={{ padding: "var(--space-4)" }}>Error loading sites: {(sitesErrorObj as Error).message}</div>;
  if (reportsError) return <div style={{ padding: "var(--space-4)" }}>Error loading complaints: {(reportsErrorObj as Error).message}</div>;

  const confirmedSites = sites || [];

  // Flatten reports, matching them to sites
  const allReports = (reports || []).map((r: any) => {
    const site = confirmedSites.find(s => s.id === r.site_id);
    return {
      ...r,
      siteName: site?.customer_name || "Unknown",
      ocNumber: site?.oc_number || "",
      issue: r.description || r.issue || "",
    };
  }).filter((r) => {
    if (selectedSiteId && r.site_id !== selectedSiteId) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (r.issue || "").toLowerCase().includes(query) ||
      (r.siteName || "").toLowerCase().includes(query) ||
      (r.ocNumber || "").toLowerCase().includes(query)
    );
  });

  const openNewModal = () => {
    setEditingReport(null);
    // The site picked in the filter above is the site you are filing for.
    setForm({ ...INITIAL_FORM, siteId: selectedSiteId, date: new Date().toISOString().split("T")[0] || "" });
    setIsModalOpen(true);
  };

  const openEditModal = (report: any) => {
    setViewingReport(null);
    setEditingReport(report);

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
      servicePersonName: report.assigned_service_person_name || "",
      assignedUserId: report.assigned_service_person_user_id || "",
      // A name typed before assignees were people: shown as a hint only.
      legacyAssignee: report.assigned_service_person_user_id ? "" : report.assigned_service_person_name || "",
      priority: report.priority || "MEDIUM",
      issue: report.description || report.issue || "",
      attachedItems: existingItems,
      attachment: report.attachment || null,
      attachmentName: report.attachment ? report.attachment.split("/").pop() || "" : "",
    });
    setIsModalOpen(true);
  };

  const MOVE_TITLES: Record<ComplaintMove, string> = {
    IN_PROGRESS: "Work started",
    RESOLVED: "Ticket resolved",
    CLOSED: "Ticket closed",
    OPEN: "Ticket reopened",
  };

  const handleMove = async (report: any, status: ComplaintMove) => {
    let notes = "";
    if (status === "RESOLVED") {
      const written = await showPrompt("Resolve ticket", "What was done to resolve it? This is kept with the ticket.");
      if (written === null) return;
      notes = written;
    } else if (status === "CLOSED" || status === "OPEN") {
      const ok = await showConfirm(
        status === "CLOSED" ? "Close ticket" : "Reopen ticket",
        status === "CLOSED" ? "Close it as checked and done?" : "Reopen it? It goes back to Open for work.",
      );
      if (!ok) return;
    }
    try {
      await setStatus.mutateAsync({ complaintId: report.id, status, notes });
      showAlert("Done", MOVE_TITLES[status]);
    } catch (err) {
      showAlert("Not changed", apiErrorMessage(err, "The ticket status could not be changed."));
    }
  };

  const handleDelete = async (report: any) => {
    if (await showConfirm("Delete Ticket", "Are you sure you want to delete this ticket?")) {
      try {
        await deleteComplaintMutation.mutateAsync(report.id);
        showAlert("Success", "Ticket deleted successfully!");
      } catch (e: any) {
        showAlert("Error", `Failed to delete ticket: ${e.message}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.siteId) {
      showAlert("Error", "Please select a customer site!");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("site_id", form.siteId);
      formData.append("description", form.issue);
      formData.append("priority", form.priority || "MEDIUM");
      // The assignee is a person's id, and only sent by someone who assigns.
      if (canManageComplaints) formData.append("assigned_user_id", form.assignedUserId || "");

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
        await updateComplaintMutation.mutateAsync({ complaintId: editingReport.id, payload: formData });
      } else {
        await createComplaintMutation.mutateAsync(formData);
      }
      setIsModalOpen(false);
    } catch (err) {
      showAlert("Ticket not saved", apiErrorMessage(err, "The ticket could not be saved."));
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
              placeholder="Search tickets..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", height: "36px", padding: "0 10px 0 34px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
            />
          </div>
        </div>
        {canCreateComplaint && (
          <button type="button" className={styles.btnDanger} onClick={openNewModal}>
            <PlusIcon size={16} /> Raise Ticket
          </button>
        )}
      </div>

      <ComplaintTable 
        reports={allReports}
        onView={setViewingReport}
        onEdit={openEditModal}
        onMove={handleMove}
        currentUserId={me.id}
        onDelete={handleDelete}
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

      <DialogComponent />
    </div>
  );
}
