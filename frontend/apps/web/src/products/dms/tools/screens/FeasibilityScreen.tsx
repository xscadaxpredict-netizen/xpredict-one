import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Save,
  Printer,
  MapPin,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crop,
  Upload,
  Trash2,
  Paperclip,
  Edit3,
  History,
  ArrowLeft,
  Eye,
  Plus,
} from "lucide-react";
import { ConfirmDialog } from "@xpredict/ui";
import { useTools } from "../api/tools";
import { listSites } from "../../site-services/api/siteServices";
import { FeasibilityReportsTable } from "../components/FeasibilityReportsTable";
import type { FeasibilityReport, CalculatedSpecs, AttachmentCategory } from "../api/types";
import styles from "./FeasibilityScreen.module.css";
const logoSvg = "/logo.svg";

type AppendixCategory =
  | "OVERALL_PROCESS_FLOW"
  | "PROCESS_DIAGRAM"
  | "ELECTRICAL_DIAGRAM"
  | "INSTALLATION_PHOTO"
  | "WATER_BEFORE_AFTER";

interface StagedAttachment {
  id?: string;
  file: File | null;
  previewUrl: string | null;
  title?: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  fit: "contain" | "cover";
}

const INITIAL_ATTACHMENTS: Record<AppendixCategory, StagedAttachment[]> = {
  OVERALL_PROCESS_FLOW: [],
  PROCESS_DIAGRAM: [],
  ELECTRICAL_DIAGRAM: [],
  INSTALLATION_PHOTO: [],
  WATER_BEFORE_AFTER: [
    { file: null, previewUrl: null, title: "Raw Water Sample", scale: 1.0, offsetX: 0, offsetY: 0, fit: "contain" },
    { file: null, previewUrl: null, title: "Treated Water Sample", scale: 1.0, offsetX: 0, offsetY: 0, fit: "contain" },
  ],
};

interface EditablePageContentProps {
  pageKey: string;
  isWordMode: boolean;
  customContent: Record<string, string>;
  onUpdate: (key: string, html: string) => void;
  onReset: (key: string) => void;
  children: React.ReactNode;
}

function EditablePageContent({
  pageKey,
  isWordMode,
  customContent,
  onUpdate,
  onReset,
  children,
}: EditablePageContentProps) {
  const isCustomized = pageKey in customContent;
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.pageEditableWrapper}>
      {isWordMode && (
        <div className={`${styles.pageEditPill} ${styles.noPrint}`} contentEditable={false}>
          <div className={styles.pageEditPillBadge}>
            <Edit3 size={12} />
            <span>
              {isCustomized
                ? "Customized Page (Click anywhere to edit)"
                : "Word Edit Mode — Click any table, bullet point, or text to edit"}
            </span>
          </div>
          {isCustomized && (
            <button
              type="button"
              className={styles.resetPageBtn}
              onClick={() => onReset(pageKey)}
              title="Revert back to auto-generated default"
            >
              <RotateCcw size={11} />
              <span>Reset Page</span>
            </button>
          )}
        </div>
      )}

      {isCustomized ? (
        <div
          ref={contentRef}
          className={`${styles.pageEditableArea} ${isWordMode ? styles.pageEditableAreaActive : ""}`}
          contentEditable={isWordMode}
          suppressContentEditableWarning={true}
          dangerouslySetInnerHTML={{ __html: customContent[pageKey] || "" }}
          onBlur={(e) => {
            const html = e.currentTarget.innerHTML;
            if (html && html !== customContent[pageKey]) {
              onUpdate(pageKey, html);
            }
          }}
        />
      ) : (
        <div
          ref={contentRef}
          className={`${styles.pageEditableArea} ${isWordMode ? styles.pageEditableAreaActive : ""}`}
          contentEditable={isWordMode}
          suppressContentEditableWarning={true}
          onBlur={(e) => {
            const html = e.currentTarget.innerHTML;
            onUpdate(pageKey, html);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function FeasibilityScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const {
    feasibilityReports = [],
    feasibilityPending,
    feasibilityTemplate,
    createFeasibilityReport,
    updateFeasibilityReport,
    deleteFeasibilityReport,
    calculateLive,
    uploadAttachment,
    deleteAttachment,
  } = useTools(orgSlug || "");

  const dbTemplates = feasibilityTemplate?.page_templates || {};

  // Load Confirmed Sites from Sales / Site Services
  const { data: confirmedSites = [] } = useQuery({
    queryKey: ["confirmed-sites", orgSlug],
    queryFn: () => listSites(orgSlug || ""),
    enabled: Boolean(orgSlug),
  });

  const [selectedSiteId, setSelectedSiteId] = useState<string>("CUSTOM");
  // Top View Mode: List / Table of Proposals vs Document Studio
  const [viewMode, setViewMode] = useState<"list" | "preview" | "studio">("list");

  // Modern UI feedback dialog matching DMS theme
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string | React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    intent?: "primary" | "danger";
    onConfirm: () => void;
  } | null>(null);

  const [reportId, setReportId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState<"sidebar" | "preview">("preview");

  // Word-like Inline Editing Mode & Custom Overrides
  const [isWordMode, setIsWordMode] = useState<boolean>(false);
  const effectiveWordMode = viewMode === "preview" ? false : isWordMode;
  const [customContent, setCustomContent] = useState<Record<string, string>>({});

  // Form Parameters (backed by DB Master Template)
  const [siteName, setSiteName] = useState("Spraying Systems India Pvt Ltd");
  const [siteLocation, setSiteLocation] = useState("Peenya Industrial Area, Bengaluru");
  const [surveyDate, setSurveyDate] = useState("2023-06-02");
  const [proposedModel, setProposedModel] = useState("HIDREC EZ 1000");
  const [capacityKld, setCapacityKld] = useState<number>(15.0);
  const [operatingHours, setOperatingHours] = useState<number>(18.0);
  const [waterType, setWaterType] = useState("Mixed Domestic Sewage");
  const [electrodeMetal, setElectrodeMetal] = useState<"AL" | "FE">("AL");
  const [targetDose, setTargetDose] = useState<number>(25.0);
  const [supplyVoltage, setSupplyVoltage] = useState<number>(48.0);

  // Sync initial parameters from DB Master Template if starting a new report
  useEffect(() => {
    if (!reportId && feasibilityTemplate?.default_parameters) {
      const def = feasibilityTemplate.default_parameters;
      if (def.site_name) setSiteName(def.site_name);
      if (def.site_location) setSiteLocation(def.site_location);
      if (def.survey_date) setSurveyDate(def.survey_date);
      if (def.proposed_model) setProposedModel(def.proposed_model);
      if (def.capacity_kld !== undefined) setCapacityKld(Number(def.capacity_kld));
      if (def.operating_hours !== undefined) setOperatingHours(Number(def.operating_hours));
      if (def.water_type) setWaterType(def.water_type);
      if (def.electrode_metal) setElectrodeMetal(def.electrode_metal);
      if (def.target_dose_mg_l !== undefined) setTargetDose(Number(def.target_dose_mg_l));
      if (def.supply_voltage !== undefined) setSupplyVoltage(Number(def.supply_voltage));
    }
  }, [feasibilityTemplate, reportId]);

  // Live Calculated Specs
  const [specs, setSpecs] = useState<CalculatedSpecs | null>(null);

  // Staged attachments for live preview & visual adjustments
  const [attachments, setAttachments] = useState<Record<AppendixCategory, StagedAttachment[]>>(INITIAL_ATTACHMENTS);

  const targetPickerRef = useRef<{ category: AppendixCategory; replaceIndex?: number }>({
    category: "PROCESS_DIAGRAM",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-calculate specs when inputs change
  useEffect(() => {
    let active = true;
    const runCalc = async () => {
      try {
        const res = await calculateLive({
          capacity_kld: capacityKld,
          operating_hours: operatingHours,
          electrode_metal: electrodeMetal,
          target_dose_mg_l: targetDose,
          supply_voltage: supplyVoltage,
        });
        if (active) setSpecs(res);
      } catch (err) {
        console.error("Live calculation failed", err);
      }
    };
    runCalc();
    return () => { active = false; };
  }, [capacityKld, operatingHours, electrodeMetal, targetDose, supplyVoltage, calculateLive]);

  // Handle Confirmed Site Selection
  const handleSiteSelect = (siteId: string) => {
    setSelectedSiteId(siteId);
    if (siteId === "CUSTOM") return;

    const found = confirmedSites.find((s) => s.id === siteId);
    if (found) {
      setSiteName(found.site_name || found.customer_name);
      const loc = [found.address, found.city, found.state].filter(Boolean).join(", ");
      setSiteLocation(loc || "Peenya Industrial Area, Bengaluru");
      if (found.installation_date) {
        setSurveyDate(found.installation_date);
      }
    }
  };

  // Switch between saved reports or create a new one
  const handleSelectReport = (id: string) => {
    if (id === "NEW") {
      setReportId(null);
      setSelectedSiteId("CUSTOM");
      const def = feasibilityTemplate?.default_parameters || {};
      setSiteName(def.site_name || "Spraying Systems India Pvt Ltd");
      setSiteLocation(def.site_location || "Peenya Industrial Area, Bengaluru");
      setSurveyDate(def.survey_date || "2023-06-02");
      setProposedModel(def.proposed_model || "HIDREC EZ 1000");
      setCapacityKld(Number(def.capacity_kld ?? 15.0));
      setOperatingHours(Number(def.operating_hours ?? 18.0));
      setWaterType(def.water_type || "Mixed Domestic Sewage");
      setElectrodeMetal(def.electrode_metal || "AL");
      setTargetDose(Number(def.target_dose_mg_l ?? 25.0));
      setSupplyVoltage(Number(def.supply_voltage ?? 48.0));
      setCustomContent({});
      setAttachments(INITIAL_ATTACHMENTS);
      return;
    }

    const rep = feasibilityReports.find((r) => r.id === id);
    if (!rep) return;

    setReportId(rep.id);
    setSelectedSiteId(rep.site || "CUSTOM");
    setSiteName(rep.site_name);
    setSiteLocation(rep.site_location);
    if (rep.survey_date) setSurveyDate(rep.survey_date);
    setProposedModel(rep.proposed_model);
    setCapacityKld(Number(rep.capacity_kld));
    setOperatingHours(Number(rep.operating_hours));
    setWaterType(rep.water_type);
    setElectrodeMetal(rep.electrode_metal);
    setTargetDose(Number(rep.target_dose_mg_l));
    setSupplyVoltage(Number(rep.supply_voltage));

    // Restore custom text overrides
    const custom = rep.design_parameters?.custom_content;
    if (custom && typeof custom === "object") {
      setCustomContent(custom);
    } else {
      setCustomContent({});
    }

    // Restore server attachments if available
    const serverAdjustments = rep.design_parameters?.attachment_adjustments || {};
    const nextAttachments: Record<AppendixCategory, StagedAttachment[]> = {
      OVERALL_PROCESS_FLOW: [],
      PROCESS_DIAGRAM: [],
      ELECTRICAL_DIAGRAM: [],
      INSTALLATION_PHOTO: [],
      WATER_BEFORE_AFTER: [
        { file: null, previewUrl: null, title: "Raw Water Sample", scale: 1.0, offsetX: 0, offsetY: 0, fit: "contain" },
        { file: null, previewUrl: null, title: "Treated Water Sample", scale: 1.0, offsetX: 0, offsetY: 0, fit: "contain" },
      ],
    };

    if (rep.attachments && rep.attachments.length > 0) {
      for (const cat of [
        "OVERALL_PROCESS_FLOW",
        "PROCESS_DIAGRAM",
        "ELECTRICAL_DIAGRAM",
        "INSTALLATION_PHOTO",
        "WATER_BEFORE_AFTER",
      ] as AppendixCategory[]) {
        const matching = rep.attachments.filter((a) => a.category === cat);
        const catAdj = serverAdjustments[cat];

        if (cat === "WATER_BEFORE_AFTER") {
          const rawAtt =
            matching.find((a) => a.title?.toLowerCase().includes("raw")) ||
            (matching[0]?.title?.toLowerCase().includes("treated") ? undefined : matching[0]);
          let treatedAtt =
            matching.find(
              (a) =>
                a.title?.toLowerCase().includes("treated") ||
                a.title?.toLowerCase().includes("clean")
            ) || (matching.length > 1 ? matching[1] : undefined);
          if (treatedAtt && rawAtt && treatedAtt.id === rawAtt.id) {
            treatedAtt = undefined;
          }
          nextAttachments[cat] = [
            rawAtt
              ? {
                  id: rawAtt.id,
                  file: null,
                  previewUrl: rawAtt.file,
                  title: rawAtt.title || "Raw Water Sample",
                  scale: catAdj?.[0]?.scale ?? 1.0,
                  offsetX: catAdj?.[0]?.offsetX ?? 0,
                  offsetY: catAdj?.[0]?.offsetY ?? 0,
                  fit: catAdj?.[0]?.fit ?? "contain",
                }
              : {
                  file: null,
                  previewUrl: null,
                  title: "Raw Water Sample",
                  scale: 1.0,
                  offsetX: 0,
                  offsetY: 0,
                  fit: "contain",
                },
            treatedAtt
              ? {
                  id: treatedAtt.id,
                  file: null,
                  previewUrl: treatedAtt.file,
                  title: treatedAtt.title || "Treated Water Sample",
                  scale: catAdj?.[1]?.scale ?? 1.0,
                  offsetX: catAdj?.[1]?.offsetX ?? 0,
                  offsetY: catAdj?.[1]?.offsetY ?? 0,
                  fit: catAdj?.[1]?.fit ?? "contain",
                }
              : {
                  file: null,
                  previewUrl: null,
                  title: "Treated Water Sample",
                  scale: 1.0,
                  offsetX: 0,
                  offsetY: 0,
                  fit: "contain",
                },
          ];
          continue;
        }

        nextAttachments[cat] = matching.map((att, idx) => {
          const adj = Array.isArray(catAdj)
            ? catAdj[idx] || {}
            : idx === 0
            ? catAdj || {}
            : {};
          return {
            id: att.id,
            file: null,
            previewUrl: att.file,
            title: att.title || att.file_name,
            scale: adj.scale ?? 1.0,
            offsetX: adj.offsetX ?? 0,
            offsetY: adj.offsetY ?? 0,
            fit: adj.fit ?? "contain",
          };
        });
      }
    }
    setAttachments(nextAttachments);
  };

  const handleUpdateCustomContent = (key: string, val: string) => {
    setCustomContent((prev) => ({ ...prev, [key]: val }));
  };

  const handleResetCustomContent = (key: string) => {
    setCustomContent((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Open file picker for an appendix or diagram
  const openFilePicker = (category: AppendixCategory, replaceIndex?: number) => {
    targetPickerRef.current = { category, replaceIndex };
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // When files are chosen, stage them immediately for live in-place viewing
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const { category, replaceIndex } = targetPickerRef.current;

    setAttachments((prev) => {
      const currentList = prev[category] || [];

      if (category === "WATER_BEFORE_AFTER") {
        const slot = replaceIndex !== undefined ? replaceIndex : (currentList[0]?.previewUrl ? 1 : 0);
        const file = files[0];
        if (!file) return prev;
        const previewUrl = URL.createObjectURL(file);
        const updated = [...currentList];
        while (updated.length <= slot) {
          updated.push({
            file: null,
            previewUrl: null,
            title: updated.length === 0 ? "Raw Water Sample" : "Treated Water Sample",
            scale: 1.0,
            offsetX: 0,
            offsetY: 0,
            fit: "contain",
          });
        }
        updated[slot] = {
          file,
          previewUrl,
          title: slot === 0 ? "Raw Water Sample" : "Treated Water Sample",
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
          fit: "contain",
        };
        return { ...prev, [category]: updated };
      }

      if (replaceIndex !== undefined && replaceIndex >= 0 && replaceIndex < currentList.length) {
        // Replace file at specified index
        const file = files[0];
        if (!file) return prev;
        const previewUrl = URL.createObjectURL(file);
        const prevItem = currentList[replaceIndex];
        const updated = [...currentList];
        updated[replaceIndex] = {
          file,
          previewUrl,
          title: file.name,
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
          fit: prevItem?.fit ?? "contain",
        };
        return { ...prev, [category]: updated };
      } else {
        // Adding new files
        const newItems: StagedAttachment[] = files.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
          title: file.name,
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
          fit: "contain",
        }));
        if (category === "OVERALL_PROCESS_FLOW") {
          // Process diagram on page 4 is a single diagram
          return { ...prev, [category]: newItems.slice(0, 1) };
        }
        return {
          ...prev,
          [category]: [...currentList, ...newItems],
        };
      }
    });
  };

  // Update zoom, pan, and crop fit for a specific attachment
  const updateAdjustment = (
    cat: AppendixCategory,
    index: number,
    updates: Partial<StagedAttachment>
  ) => {
    setAttachments((prev) => {
      const list = prev[cat] || [];
      const prevItem = list[index];
      if (!prevItem) return prev;
      const updated = [...list];
      updated[index] = {
        ...prevItem,
        ...updates,
      };
      return { ...prev, [cat]: updated };
    });
  };

  // Remove uploaded image
  const removeAttachment = async (cat: AppendixCategory, index: number) => {
    const list = attachments[cat] || [];
    const target = list[index];
    if (target?.id && reportId) {
      try {
        await deleteAttachment({ reportId, attachmentId: target.id });
      } catch (err) {
        console.error("Failed to delete attachment from server", err);
      }
    }
    setAttachments((prev) => {
      const cur = [...(prev[cat] || [])];
      if (cat === "WATER_BEFORE_AFTER") {
        if (cur[index]) {
          cur[index] = {
            file: null,
            previewUrl: null,
            title: index === 0 ? "Raw Water Sample" : "Treated Water Sample",
            scale: 1.0,
            offsetX: 0,
            offsetY: 0,
            fit: "contain",
          };
        }
        return { ...prev, [cat]: cur };
      }
      return {
        ...prev,
        [cat]: cur.filter((_, i) => i !== index),
      };
    });
  };

  // Save Feasibility Report to Database along with all staged attachments & custom edits
  const handleSaveReport = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsSaving(true);
    try {
      const payload: Partial<FeasibilityReport> = {
        site: selectedSiteId !== "CUSTOM" ? selectedSiteId : null,
        site_name: siteName,
        site_location: siteLocation,
        survey_date: surveyDate,
        proposed_model: proposedModel,
        capacity_kld: capacityKld,
        operating_hours: operatingHours,
        water_type: waterType,
        electrode_metal: electrodeMetal,
        target_dose_mg_l: targetDose,
        supply_voltage: supplyVoltage,
        design_parameters: {
          custom_content: customContent,
          attachment_adjustments: {
            OVERALL_PROCESS_FLOW: (attachments.OVERALL_PROCESS_FLOW || []).map((a) => ({
              scale: a.scale,
              offsetX: a.offsetX,
              offsetY: a.offsetY,
              fit: a.fit,
            })),
            PROCESS_DIAGRAM: (attachments.PROCESS_DIAGRAM || []).map((a) => ({
              scale: a.scale,
              offsetX: a.offsetX,
              offsetY: a.offsetY,
              fit: a.fit,
            })),
            ELECTRICAL_DIAGRAM: (attachments.ELECTRICAL_DIAGRAM || []).map((a) => ({
              scale: a.scale,
              offsetX: a.offsetX,
              offsetY: a.offsetY,
              fit: a.fit,
            })),
            INSTALLATION_PHOTO: (attachments.INSTALLATION_PHOTO || []).map((a) => ({
              scale: a.scale,
              offsetX: a.offsetX,
              offsetY: a.offsetY,
              fit: a.fit,
            })),
            WATER_BEFORE_AFTER: (attachments.WATER_BEFORE_AFTER || []).map((a) => ({
              scale: a.scale,
              offsetX: a.offsetX,
              offsetY: a.offsetY,
              fit: a.fit,
            })),
          },
        },
        status: "FINAL",
      };

      let activeId = reportId;
      if (activeId) {
        await updateFeasibilityReport({ id: activeId, data: payload });
      } else {
        const created = await createFeasibilityReport(payload);
        activeId = created.id;
        setReportId(created.id);
      }

      // Automatically upload all staged files to the backend report attachments
      for (const [cat, items] of Object.entries(attachments)) {
        for (const att of items) {
          if (att.file && activeId) {
            const fd = new FormData();
            fd.append("file", att.file);
            fd.append("category", cat as AttachmentCategory);
            fd.append("title", att.title || att.file.name);
            await uploadAttachment({ reportId: activeId, formData: fd });
          }
        }
      }

      setConfirmState({
        open: true,
        title: "Proposal Saved Successfully",
        message: `Your technical feasibility report for "${siteName || "Custom Site"}" (${capacityKld} KLD) has been saved with all calculations, custom texts, and diagram adjustments.`,
        confirmLabel: "View All Proposals",
        cancelLabel: "Continue Editing",
        intent: "primary",
        onConfirm: () => {
          setViewMode("list");
        },
      });
    } catch (err: any) {
      setConfirmState({
        open: true,
        title: "Error Saving Proposal",
        message: `Unable to save feasibility report: ${err.message}`,
        confirmLabel: "OK",
        cancelLabel: "Close",
        intent: "danger",
        onConfirm: () => {},
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Table action handlers
  const handleTableNew = () => {
    handleSelectReport("NEW");
    setViewMode("studio");
    setMobileTab("sidebar");
  };

  const handleTableView = (id: string) => {
    handleSelectReport(id);
    setIsWordMode(false);
    setViewMode("preview");
  };

  const handleTableEdit = (id: string) => {
    handleSelectReport(id);
    setViewMode("studio");
    setMobileTab("sidebar");
  };

  const handleTablePrint = (id: string) => {
    handleSelectReport(id);
    setIsWordMode(false);
    setViewMode("preview");
    setTimeout(() => {
      window.print();
    }, 400);
  };

  const handleTableDelete = (rep: FeasibilityReport) => {
    setConfirmState({
      open: true,
      title: "Delete Proposal",
      message: `Are you sure you want to delete proposal "${rep.project_title || rep.site_name}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      intent: "danger",
      onConfirm: async () => {
        try {
          await deleteFeasibilityReport(rep.id);
          if (reportId === rep.id) {
            handleSelectReport("NEW");
          }
        } catch (err: any) {
          console.error("Delete failed", err);
        }
      },
    });
  };

  // Trigger print / save PDF
  const handlePrint = () => {
    window.print();
  };

  // Render an interactive attachment viewer with zoom, pan, and crop controls
  const renderAttachmentFrame = (
    category: AppendixCategory,
    index: number,
    att: StagedAttachment | undefined,
    title: string,
    defaultPlaceholder?: React.ReactNode,
    isCompact?: boolean
  ) => {
    const isCustom = Boolean(att?.previewUrl);
    const showControls = viewMode === "studio";

    return (
      <div className={styles.attachmentWrapper}>
        {showControls && (
          <div className={`${styles.attachmentControls} ${isCompact ? styles.attachmentControlsCompact : ""} ${styles.noPrint}`}>
            <div className={styles.controlGroup}>
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => openFilePicker(category, index)}
                title={isCustom ? "Replace Image" : "Upload Custom Image"}
              >
                <Upload size={13} />
                <span>{isCustom ? "Replace" : "Upload Custom"}</span>
              </button>
              {category !== "OVERALL_PROCESS_FLOW" && category !== "WATER_BEFORE_AFTER" && (
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => openFilePicker(category)}
                  title="Add another drawing or photo"
                >
                  <Plus size={13} />
                  <span>+ Add More</span>
                </button>
              )}
              {isCustom && (
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => removeAttachment(category, index)}
                  title="Remove custom image"
                  style={{ color: "var(--color-danger)" }}
                >
                  <Trash2 size={13} />
                  <span>Remove</span>
                </button>
              )}
            </div>

            {isCustom && att && (
              <div className={styles.controlGroup}>
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() =>
                    updateAdjustment(category, index, {
                      scale: Math.max(0.4, Number((att.scale - 0.1).toFixed(1))),
                    })
                  }
                  title="Zoom Out (-10%)"
                >
                  <ZoomOut size={13} />
                </button>
                <span className={styles.zoomBadge}>{Math.round(att.scale * 100)}%</span>
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() =>
                    updateAdjustment(category, index, {
                      scale: Math.min(3.0, Number((att.scale + 0.1).toFixed(1))),
                    })
                  }
                  title="Zoom In (+10%)"
                >
                  <ZoomIn size={13} />
                </button>

                <button
                  type="button"
                  className={`${styles.controlBtn} ${att.fit === "cover" ? styles.controlBtnActive : ""}`}
                  onClick={() =>
                    updateAdjustment(category, index, {
                      fit: att.fit === "contain" ? "cover" : "contain",
                    })
                  }
                  title="Toggle Contain (fit whole drawing) vs Cover (crop to fill)"
                >
                  <Crop size={13} />
                  <span>{att.fit === "cover" ? "Fill Frame" : "Fit All"}</span>
                </button>

                {!isCompact && (
                  <div className={styles.panControls} title="Pan image horizontally or vertically">
                    <span>Pan:</span>
                    <input
                      type="range"
                      min="-150"
                      max="150"
                      value={att.offsetX}
                      onChange={(e) =>
                        updateAdjustment(category, index, { offsetX: parseInt(e.target.value) })
                      }
                      className={styles.panSlider}
                      title={`Pan X: ${att.offsetX}px`}
                    />
                    <input
                      type="range"
                      min="-150"
                      max="150"
                      value={att.offsetY}
                      onChange={(e) =>
                        updateAdjustment(category, index, { offsetY: parseInt(e.target.value) })
                      }
                      className={styles.panSlider}
                      title={`Pan Y: ${att.offsetY}px`}
                    />
                  </div>
                )}

                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() =>
                    updateAdjustment(category, index, {
                      scale: 1.0,
                      offsetX: 0,
                      offsetY: 0,
                      fit: "contain",
                    })
                  }
                  title="Reset zoom and position to default"
                >
                  <RotateCcw size={13} />
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div
          className={`${styles.imageFrame} ${isCompact ? styles.imageFrameCompact : ""} ${
            isCustom ? styles.imageFrameSolid : ""
          }`}
        >
          {isCustom && att?.previewUrl ? (
            <img
              src={att.previewUrl}
              alt={title}
              className={styles.imageAdjustable}
              style={{
                transform: `scale(${att.scale}) translate(${att.offsetX}px, ${att.offsetY}px)`,
                objectFit: att.fit,
                width: att.fit === "cover" ? "100%" : "auto",
                height: att.fit === "cover" ? "100%" : "auto",
              }}
            />
          ) : (
            defaultPlaceholder
          )}
        </div>
      </div>
    );
  };

  const appendixACount = Math.max(1, attachments.PROCESS_DIAGRAM.length);
  const appendixBCount = Math.max(1, attachments.ELECTRICAL_DIAGRAM.length);
  const appendixAPage = 12;
  const appendixBPage = 11 + appendixACount + 1;
  const appendixCPage = 11 + appendixACount + appendixBCount + 1;

  return (
    <div className={viewMode === "list" ? styles.outerContainerList : styles.outerContainer}>
      {viewMode === "list" ? (
        <FeasibilityReportsTable
          reports={feasibilityReports}
          isLoading={feasibilityPending}
          onNewReport={handleTableNew}
          onViewReport={handleTableView}
          onEditReport={handleTableEdit}
          onPrintReport={handleTablePrint}
          onDeleteReport={handleTableDelete}
        />
      ) : (
        <>
          {viewMode === "preview" ? (
            <div className={`${styles.previewToolbar} ${styles.noPrint}`}>
              <div className={styles.previewToolbarLeft}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setViewMode("list")}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Proposals</span>
                </button>
                <div className={styles.studioActiveBadge}>
                  <span>Viewing:</span>
                  <span className={styles.studioActiveTitle}>
                    {siteName || "Feasibility Proposal"} ({proposedModel || "WWT-REC"})
                  </span>
                  <span
                    style={{
                      marginLeft: "8px",
                      background: "#ecfdf5",
                      color: "#047857",
                      border: "1px solid #a7f3d0",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    FINAL
                  </span>
                </div>
              </div>

              <div className={styles.previewToolbarRight}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setViewMode("studio")}
                  title="Modify proposal parameters and content"
                >
                  <Edit3 size={14} />
                  <span>Edit Proposal</span>
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handlePrint}
                  title="Print or export document as PDF"
                >
                  <Printer size={14} />
                  <span>Print / PDF</span>
                </button>
              </div>
            </div>
          ) : (
            <div className={`${styles.studioTopNav} ${styles.noPrint}`}>
              <div className={styles.studioTopLeft}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setViewMode("list")}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Proposals Table</span>
                </button>
                <div className={styles.studioActiveBadge}>
                  <span>Editing:</span>
                  <span className={styles.studioActiveTitle}>
                    {reportId
                      ? `${siteName || "Proposal"} (${proposedModel || "WWT-REC"})`
                      : "New Draft Proposal"}
                  </span>
                </div>
              </div>

              <div className={styles.studioTopLeft}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setViewMode("preview")}
                  title="Switch to clean full-screen preview"
                >
                  <Eye size={14} />
                  <span>View Clean Preview</span>
                </button>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={handleTableNew}
                  title="Clear and start a fresh proposal"
                >
                  <span>+ New Draft</span>
                </button>
              </div>
            </div>
          )}

          <div className={styles.studioLayout}>
      {/* Mobile Switcher Tab (Hidden on Desktop) */}
      {viewMode === "studio" && (
      <div className={`${styles.mobileTabNav} ${styles.noPrint}`}>
        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "sidebar" ? styles.mobileTabBtnActive : ""}`}
          onClick={() => setMobileTab("sidebar")}
        >
          <Sliders size={14} />
          <span>Config &amp; Inputs</span>
        </button>
        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "preview" ? styles.mobileTabBtnActive : ""}`}
          onClick={() => setMobileTab("preview")}
        >
          <FileText size={14} />
          <span>Proposal Preview</span>
        </button>
      </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 1. LEFT CONFIGURATOR SIDEBAR (Hidden in Print)                       */}
      {/* -------------------------------------------------------------------- */}
      {viewMode === "studio" && (
      <aside className={`${styles.leftSidebar} ${mobileTab !== "sidebar" ? styles.sidebarHiddenOnMobile : ""} ${styles.noPrint}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitleRow}>
            <div className={styles.sidebarTitle}>
              <FileText size={18} style={{ color: "var(--color-primary)" }} />
              <span>Feasibility Studio</span>
            </div>
            {reportId && (
              <span className={styles.savedPill}>Saved</span>
            )}
          </div>

          <div className={styles.sidebarActions}>
            <button
              className={styles.btnPrimary}
              onClick={handleSaveReport}
              disabled={isSaving}
            >
              <Save size={15} />
              <span>{isSaving ? "Saving..." : reportId ? "Update Report" : "Save Report"}</span>
            </button>
            <button className={styles.btnPrint} onClick={handlePrint}>
              <Printer size={15} />
              <span>PDF / Print</span>
            </button>
          </div>

          {/* Word Edit Mode Toggle */}
          <div className={styles.wordModeToggle}>
            <div className={styles.wordModeToggleLabel}>
              <Edit3 size={14} style={{ color: "var(--color-primary)" }} />
              <span>Word Edit Mode</span>
            </div>
            <label className={styles.toggleSwitch} title="Toggle direct in-place editing for all tables, bullet points, and content">
              <input
                type="checkbox"
                checked={isWordMode}
                onChange={(e) => setIsWordMode(e.target.checked)}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
          {isWordMode && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--color-text-3)", padding: "0 var(--space-1)" }}>
              <span>
                {Object.keys(customContent).length > 0 ? (
                  <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                    {Object.keys(customContent).length} page(s) customized
                  </span>
                ) : (
                  "Click any table, point, or text"
                )}
              </span>
              {Object.keys(customContent).length > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomContent({})}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-danger)",
                    cursor: "pointer",
                    fontWeight: 600,
                    textDecoration: "underline",
                    fontSize: "11px",
                    padding: 0,
                  }}
                  title="Reset all pages back to auto-calculated default text, tables, and points"
                >
                  Reset All
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.sidebarScrollArea}>
          {/* Saved Proposals Selector */}
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarCardTitle}>
              <History size={14} style={{ color: "var(--color-primary)" }} />
              <span>Saved Proposals ({feasibilityReports.length})</span>
            </div>
            <div className={styles.configItem}>
              <label className={styles.configLabel}>Switch or View Proposal</label>
              <select
                className={styles.configSelect}
                value={reportId || "NEW"}
                onChange={(e) => handleSelectReport(e.target.value)}
              >
                <option value="NEW">[ + Create New Proposal ]</option>
                {feasibilityReports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.site_name} — {r.capacity_kld} KLD ({new Date(r.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            {reportId && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--color-text-3)" }}>
                <span style={{ color: "var(--color-success)", fontWeight: 600 }}>● Editing active proposal</span>
                <button
                  type="button"
                  onClick={() => handleSelectReport("NEW")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-primary)",
                    cursor: "pointer",
                    fontWeight: 600,
                    textDecoration: "underline",
                    fontSize: "11px",
                    padding: 0,
                  }}
                >
                  + New Proposal
                </button>
              </div>
            )}
          </div>

          {/* Confirmed Site Section */}
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarCardTitle}>
              <MapPin size={14} style={{ color: "var(--color-primary)" }} />
              <span>Site &amp; Client Details</span>
            </div>
            
            <div className={styles.configItem}>
              <label className={styles.configLabel}>Select Confirmed Site</label>
              <select
                className={styles.configSelect}
                value={selectedSiteId}
                onChange={(e) => handleSiteSelect(e.target.value)}
              >
                <option value="CUSTOM">[ + Custom / Prospective Site ]</option>
                {confirmedSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.site_name || s.customer_name} ({s.city || "Site"})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.configItem}>
              <label className={styles.configLabel}>Site / Client Name</label>
              <input
                type="text"
                className={styles.configInput}
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Client / Company Name"
              />
            </div>

            <div className={styles.configItem}>
              <label className={styles.configLabel}>Site Location</label>
              <input
                type="text"
                className={styles.configInput}
                value={siteLocation}
                onChange={(e) => setSiteLocation(e.target.value)}
                placeholder="City / Industrial Area"
              />
            </div>

            <div className={styles.configItem}>
              <label className={styles.configLabel}>Proposed Machine Model</label>
              <input
                type="text"
                className={styles.configInput}
                value={proposedModel}
                onChange={(e) => setProposedModel(e.target.value)}
                placeholder="e.g. HIDREC EZ 1000"
              />
            </div>

            <div className={styles.configItem}>
              <label className={styles.configLabel}>Survey Date</label>
              <input
                type="date"
                className={styles.configInput}
                value={surveyDate}
                onChange={(e) => setSurveyDate(e.target.value)}
              />
            </div>
          </div>

          {/* Staged Attachments & Diagrams Section */}
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarCardTitle}>
              <Paperclip size={14} style={{ color: "var(--color-primary)" }} />
              <span>Diagrams &amp; Attachments</span>
            </div>

            {/* Page 4 Process Diagram */}
            <div className={styles.sidebarCategoryCard}>
              <div className={styles.sidebarCategoryHeader}>
                <span className={styles.sidebarCategoryTitle}>Page 4: Process Flow Diagram</span>
                <span
                  className={
                    attachments.OVERALL_PROCESS_FLOW.length > 0
                      ? styles.sidebarCategoryBadgeSuccess
                      : styles.sidebarCategoryBadge
                  }
                >
                  {attachments.OVERALL_PROCESS_FLOW.length > 0
                    ? "✓ Custom Flow Ready"
                    : "Default Flowchart"}
                </span>
              </div>
              {attachments.OVERALL_PROCESS_FLOW.length > 0 && attachments.OVERALL_PROCESS_FLOW[0]?.previewUrl ? (
                <div className={styles.sidebarUploadChips}>
                  <div className={styles.sidebarChip}>
                    <div className={styles.sidebarChipInfo}>
                      <img
                        src={attachments.OVERALL_PROCESS_FLOW[0].previewUrl}
                        alt="Process Diagram"
                        className={styles.sidebarChipThumb}
                      />
                      <span className={styles.sidebarChipName}>
                        {attachments.OVERALL_PROCESS_FLOW[0].title || "Process Flow Diagram"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.sidebarChipRemove}
                      onClick={() => removeAttachment("OVERALL_PROCESS_FLOW", 0)}
                      title="Remove custom diagram and revert to default"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() =>
                  openFilePicker(
                    "OVERALL_PROCESS_FLOW",
                    attachments.OVERALL_PROCESS_FLOW.length > 0 ? 0 : undefined
                  )
                }
              >
                <Upload size={12} />
                <span>
                  {attachments.OVERALL_PROCESS_FLOW.length > 0 ? "Replace Flow Diagram" : "Upload Flow Diagram"}
                </span>
              </button>
            </div>

            {/* Raw Water Sample Photo (Slot 0) */}
            <div className={styles.sidebarCategoryCard}>
              <div className={styles.sidebarCategoryHeader}>
                <span className={styles.sidebarCategoryTitle}>Raw Water Sample Photo</span>
                <span
                  className={
                    attachments.WATER_BEFORE_AFTER[0]?.previewUrl
                      ? styles.sidebarCategoryBadgeSuccess
                      : styles.sidebarCategoryBadge
                  }
                >
                  {attachments.WATER_BEFORE_AFTER[0]?.previewUrl
                    ? "✓ Photo Ready"
                    : "Default Jars"}
                </span>
              </div>
              {attachments.WATER_BEFORE_AFTER[0]?.previewUrl ? (
                <div className={styles.sidebarUploadChips}>
                  <div className={styles.sidebarChip}>
                    <div className={styles.sidebarChipInfo}>
                      <img
                        src={attachments.WATER_BEFORE_AFTER[0].previewUrl}
                        alt="Raw Water Sample"
                        className={styles.sidebarChipThumb}
                      />
                      <span className={styles.sidebarChipName}>
                        {attachments.WATER_BEFORE_AFTER[0].title || "Raw Water Sample"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.sidebarChipRemove}
                      onClick={() => removeAttachment("WATER_BEFORE_AFTER", 0)}
                      title="Remove raw water photo and revert to default"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => openFilePicker("WATER_BEFORE_AFTER", 0)}
              >
                <Upload size={12} />
                <span>
                  {attachments.WATER_BEFORE_AFTER[0]?.previewUrl ? "Replace Raw Water Photo" : "Upload Raw Water Photo"}
                </span>
              </button>
            </div>

            {/* Final Treated Water Sample Photo (Slot 1) */}
            <div className={styles.sidebarCategoryCard}>
              <div className={styles.sidebarCategoryHeader}>
                <span className={styles.sidebarCategoryTitle}>Final Treated Water Photo</span>
                <span
                  className={
                    attachments.WATER_BEFORE_AFTER[1]?.previewUrl
                      ? styles.sidebarCategoryBadgeSuccess
                      : styles.sidebarCategoryBadge
                  }
                >
                  {attachments.WATER_BEFORE_AFTER[1]?.previewUrl
                    ? "✓ Photo Ready"
                    : "Default Jars"}
                </span>
              </div>
              {attachments.WATER_BEFORE_AFTER[1]?.previewUrl ? (
                <div className={styles.sidebarUploadChips}>
                  <div className={styles.sidebarChip}>
                    <div className={styles.sidebarChipInfo}>
                      <img
                        src={attachments.WATER_BEFORE_AFTER[1].previewUrl}
                        alt="Treated Water Sample"
                        className={styles.sidebarChipThumb}
                      />
                      <span className={styles.sidebarChipName}>
                        {attachments.WATER_BEFORE_AFTER[1].title || "Treated Water Sample"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.sidebarChipRemove}
                      onClick={() => removeAttachment("WATER_BEFORE_AFTER", 1)}
                      title="Remove treated water photo and revert to default"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => openFilePicker("WATER_BEFORE_AFTER", 1)}
              >
                <Upload size={12} />
                <span>
                  {attachments.WATER_BEFORE_AFTER[1]?.previewUrl ? "Replace Treated Water Photo" : "Upload Treated Water Photo"}
                </span>
              </button>
            </div>

            {/* Appendix A: P&ID Diagram */}
            <div className={styles.sidebarCategoryCard}>
              <div className={styles.sidebarCategoryHeader}>
                <span className={styles.sidebarCategoryTitle}>Appendix A: P&amp;ID Drawings</span>
                <span
                  className={
                    attachments.PROCESS_DIAGRAM.length > 0
                      ? styles.sidebarCategoryBadgeSuccess
                      : styles.sidebarCategoryBadge
                  }
                >
                  {attachments.PROCESS_DIAGRAM.length > 0
                    ? `${attachments.PROCESS_DIAGRAM.length} drawing(s)`
                    : "Default P&ID"}
                </span>
              </div>
              {attachments.PROCESS_DIAGRAM.length > 0 && (
                <div className={styles.sidebarUploadChips}>
                  {attachments.PROCESS_DIAGRAM.map((att, idx) => (
                    <div key={`proc-${idx}`} className={styles.sidebarChip}>
                      <div className={styles.sidebarChipInfo}>
                        {att.previewUrl && (
                          <img
                            src={att.previewUrl}
                            alt={`Sheet ${idx + 1}`}
                            className={styles.sidebarChipThumb}
                          />
                        )}
                        <span className={styles.sidebarChipName}>
                          Sheet {idx + 1}: {att.title || `Drawing ${idx + 1}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.sidebarChipRemove}
                        onClick={() => removeAttachment("PROCESS_DIAGRAM", idx)}
                        title={`Remove Sheet ${idx + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => openFilePicker("PROCESS_DIAGRAM")}
              >
                <Plus size={12} />
                <span>Add P&amp;ID Drawing</span>
              </button>
            </div>

            {/* Appendix B: Electrical Schematics */}
            <div className={styles.sidebarCategoryCard}>
              <div className={styles.sidebarCategoryHeader}>
                <span className={styles.sidebarCategoryTitle}>Appendix B: Electrical Schematics</span>
                <span
                  className={
                    attachments.ELECTRICAL_DIAGRAM.length > 0
                      ? styles.sidebarCategoryBadgeSuccess
                      : styles.sidebarCategoryBadge
                  }
                >
                  {attachments.ELECTRICAL_DIAGRAM.length > 0
                    ? `${attachments.ELECTRICAL_DIAGRAM.length} sheet(s)`
                    : "Default Schematics"}
                </span>
              </div>
              {attachments.ELECTRICAL_DIAGRAM.length > 0 && (
                <div className={styles.sidebarUploadChips}>
                  {attachments.ELECTRICAL_DIAGRAM.map((att, idx) => (
                    <div key={`elec-${idx}`} className={styles.sidebarChip}>
                      <div className={styles.sidebarChipInfo}>
                        {att.previewUrl && (
                          <img
                            src={att.previewUrl}
                            alt={`Sheet ${idx + 1}`}
                            className={styles.sidebarChipThumb}
                          />
                        )}
                        <span className={styles.sidebarChipName}>
                          Sheet {idx + 1}: {att.title || `Schematic ${idx + 1}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.sidebarChipRemove}
                        onClick={() => removeAttachment("ELECTRICAL_DIAGRAM", idx)}
                        title={`Remove Sheet ${idx + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => openFilePicker("ELECTRICAL_DIAGRAM")}
              >
                <Plus size={12} />
                <span>Add Electrical Sheet</span>
              </button>
            </div>

            {/* Appendix C: Site Installation Photos */}
            <div className={styles.sidebarCategoryCard}>
              <div className={styles.sidebarCategoryHeader}>
                <span className={styles.sidebarCategoryTitle}>Appendix C: Site Photos</span>
                <span
                  className={
                    attachments.INSTALLATION_PHOTO.length > 0
                      ? styles.sidebarCategoryBadgeSuccess
                      : styles.sidebarCategoryBadge
                  }
                >
                  {attachments.INSTALLATION_PHOTO.length > 0
                    ? `${attachments.INSTALLATION_PHOTO.length} photo(s)`
                    : "Skid Placeholder"}
                </span>
              </div>
              {attachments.INSTALLATION_PHOTO.length > 0 && (
                <div className={styles.sidebarUploadChips}>
                  {attachments.INSTALLATION_PHOTO.map((att, idx) => (
                    <div key={`photo-${idx}`} className={styles.sidebarChip}>
                      <div className={styles.sidebarChipInfo}>
                        {att.previewUrl && (
                          <img
                            src={att.previewUrl}
                            alt={`Photo ${idx + 1}`}
                            className={styles.sidebarChipThumb}
                          />
                        )}
                        <span className={styles.sidebarChipName}>
                          Photo {idx + 1}: {att.title || `Site Photo ${idx + 1}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.sidebarChipRemove}
                        onClick={() => removeAttachment("INSTALLATION_PHOTO", idx)}
                        title={`Remove Photo ${idx + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => openFilePicker("INSTALLATION_PHOTO")}
              >
                <Plus size={12} />
                <span>Add Site Photo</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
      )}

      {/* Hidden file input for uploading attachments */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileSelected}
        accept=".png,.jpg,.jpeg,.svg,.webp,.pdf"
        multiple
      />

      {/* -------------------------------------------------------------------- */}
      {/* 2. RIGHT PREVIEW CANVAS (Exact 1:1 PDF Layout, Un-overlapped)         */}
      {/* -------------------------------------------------------------------- */}
      <main className={`${styles.rightPreview} ${mobileTab !== "preview" ? styles.previewHiddenOnMobile : ""}`}>
        {/* Mobile reminder pill in preview */}
        {viewMode === "studio" && (
        <div className={`${styles.mobileTabNav} ${styles.noPrint}`} style={{ marginBottom: "var(--space-2)" }}>
          <button type="button" className={styles.mobileTabBtn} onClick={() => setMobileTab("sidebar")}>
            <Sliders size={13} /> <span>Back to Inputs</span>
          </button>
          <button type="button" className={styles.mobileTabBtn} onClick={handlePrint}>
            <Printer size={13} /> <span>PDF / Print</span>
          </button>
        </div>
        )}
        <div className={styles.documentCanvas}>

          {/* ================================================================== */}
          {/* PAGE 1: COVER PAGE                                                 */}
          {/* ================================================================== */}
          <div className={styles.a4Page}>
            <div className={styles.coverBanners} contentEditable={false}>
              <div className={styles.coverPolygon2} />
              <div className={styles.coverPolygon1} />
            </div>

            <div style={{ marginTop: "110px", textAlign: "center" }} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.coverLogo} />
            </div>

          <EditablePageContent
              pageKey="page_1"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.coverTitleArea}>
            <div className={styles.coverMainTitle}>{dbTemplates.page1_cover?.title || "WASTE WATER RECLAIMER PLANT"}</div>
            <div className={styles.coverSubTitle}>{dbTemplates.page1_cover?.subtitle || "Project details"}</div>
          </div>

          <div className={styles.coverAbstractBox}>
            <div className={styles.coverAbstractTitle}>Abstract</div>
            <div className={styles.coverAbstractText}>
                {dbTemplates.page1_cover?.abstract || (
                  <>
                    This document provides the complete set of details from site visit to feasibility
                    of the waste water reclaimer plants installed at <strong>{siteName}</strong>, <strong>{siteLocation}</strong>.
                    The details of process, installation data, along with sketch and water test reports are provided in this document.
                  </>
                )}
              </div>
          </div>

          <div className={styles.coverFooterMeta}>
            <strong>{dbTemplates.page1_cover?.organization_name || "Xpredict Automation Solutions Pvt Ltd"}</strong><br />
            info@xpredictlabs.com
          </div>
        </EditablePageContent>
      </div>

        {/* ================================================================== */}
        {/* PAGE 2: TABLE OF CONTENTS                                          */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_2"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1e3a8a", margin: "1.5rem 0 1rem" }}>
              Contents
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "12.5px", color: "#334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>SITE VISIT REPORT</strong></span>
                <span><strong>2</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>OBSERVATION ...........................................................................................................................................................</span>
                <span>2</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "25px" }}>
                <span>PRE-INSTALLATION ...................................................................................................................................................</span>
                <span>2</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "25px" }}>
                <span>POST INSTALLATION .................................................................................................................................................</span>
                <span>2</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>PROPOSAL ................................................................................................................................................................</span>
                <span>2</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>PROCESS DIAGRAM &amp; 5-STAGE DESCRIPTION</strong> ............................................................................................</span>
                <span><strong>3</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>DESIGN CALCULATIONS &amp; TREATMENT METHODOLOGY</strong> .............................................................................</span>
                <span><strong>4</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>BAR SCREEN ............................................................................................................................................................</span>
                <span>4</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>OIL AND GREASE SEPARATOR &amp; RAW WATER TANKS 1 &amp; 2 ................................................................................</span>
                <span>5</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>DIFFUSER SPECIFICATIONS, PUMP &amp; EC CRITERIA ...........................................................................................</span>
                <span>6</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>1. Reactor Volume &amp; Retention Time .........................................................................................................................</span>
                <span>7</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>2. Electrode Area &amp; Configuration ............................................................................................................................</span>
                <span>7</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>3. Faraday’s Law for Metal Dissolution ....................................................................................................................</span>
                <span>7</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>4. Energy Consumption &amp; Clarifier Sizing ..............................................................................................................</span>
                <span>8</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>TERTIARY PRESSURE FILTRATION &amp; PRESSURE PIPING ....................................................................................</span>
                <span>9</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>OPERATIONAL WATER QUALITY REPORT</strong> ..........................................................................................................</span>
                <span><strong>10</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>WATER SAMPLES COMPARISON &amp; SUMMARY .........................................................................................................</span>
                <span>11</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>ATTACHMENTS</strong> ...........................................................................................................................................................</span>
                <span><strong>11</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>APPENDIX A: Process Flow Diagram (P&amp;ID) .................................................................................................................</span>
                <span><strong>{appendixAPage}</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>APPENDIX B: Electrical Schematic ..........................................................................................................................</span>
                <span><strong>{appendixBPage}</strong></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "15px" }}>
                <span>APPENDIX C: Machine Installation &amp; Site Photos .................................................................................................</span>
                <span><strong>{appendixCPage}</strong></span>
              </div>
            </div>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 1</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 3: SITE VISIT REPORT & OBSERVATIONS                           */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_3"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.reportMainTitle}>FEASIBILITY REPORT</div>

            <div className={styles.sectionHeader}>SITE VISIT REPORT</div>
            <p><strong>Date of site Visit:</strong> {surveyDate}</p>
            <p>
                The production facility of <strong>{siteName}</strong> at <strong>{siteLocation}</strong> was
                duly surveyed for the STP water treatment needs. The site currently has a septic tank to hold
                the solid sludge and clarify the waste water for discharge.
              </p>
            <p>
                The tank is capable of holding {(capacityKld * 1000).toLocaleString()} Litres of waste water and
                it is safe to operate at about <strong>{capacityKld} KLD</strong> to clarify the solid sludge.
                The water is then discharged directly as of now.
              </p>

            <div className={styles.sectionHeader}>OBSERVATION</div>
            <div className={styles.subSectionHeader}>PRE-INSTALLATION</div>
            <ul className={styles.reportList}>
              <li>The waste water is generated at the toilets, handwash and the kitchen / dish wash at site.</li>
              <li>The waste water at large contains soapy contaminants and minor content is from human waste through site toilets.</li>
              <li>The septic tank currently is filling up due to water being not of discharge worthy quality at the frequency of once a fortnight.</li>
              <li>Due to the nature of the waste water and its content, general biological process based STPs would not be able to provide effective treatment.</li>
              <li>There is constraint for space since the industry is set-up fully across the available land and would naturally grow needing more real-estate.</li>
              <li>The STP should be completely automatic as dedicating operational human resource would be taxing on the company.</li>
              <li>The running cost of the STP should be as minimal as possible since the ROI is mostly on environmental concern.</li>
              <li>The installation should be simple and should not be a burden on running operations and compliances of the company.</li>
              <li>An STP that can handle varying water quality at approximately <strong>{capacityKld} KLD</strong> is needed to effectively address the requirement.</li>
            </ul>

            <div className={styles.subSectionHeader}>POST INSTALLATION</div>
            <p>
                <strong>{proposedModel}</strong> installation was successfully planned for the site.
                Output was stabilized for continuous running over an operational lifecycle.
              </p>

            <div className={styles.sectionHeader}>PROPOSAL</div>
            <p>
                XpredictLabs proposed <strong>{proposedModel}</strong> model to be immediately implemented on site
                as a one stop solution to all the aforementioned problems of M/S <strong>{siteName}</strong>.
                The plant can easily be deployed and re-deployed since it is completely mobile and takes up only{" "}
                <strong>{specs?.footprint.total_area_sqft || 200} sqft</strong> land. The plant is completely automatic.
              </p>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 2</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 4: PROCESS DIAGRAM & 5-STAGE DESCRIPTION                      */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_4"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>PROCESS DIAGRAM</div>
            <p>
              The {proposedModel} water reclaimer contains all the stipulated processes along with
              advanced integration and space saving options. The overall process diagram of the machine is as provided below:
            </p>

            {/* Overall Process Flow Diagram: Uploadable Custom Diagram or Default SVG */}
            <div contentEditable={false}>
              {renderAttachmentFrame(
                "OVERALL_PROCESS_FLOW",
                0,
                attachments.OVERALL_PROCESS_FLOW[0],
                "Overall Process Diagram",
                <div className={styles.diagramContainer}>
                  <svg width="600" height="230" viewBox="0 0 600 230" style={{ maxWidth: "100%" }}>
                    {/* Lifting Station */}
                    <rect x="10" y="40" width="80" height="70" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="30" y="55" width="20" height="40" fill="#3b82f6" />
                    <rect x="55" y="70" width="15" height="25" fill="#1d4ed8" />
                    <text x="50" y="125" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1e3a8a">LIFTING STATION</text>

                    <line x1="90" y1="75" x2="130" y2="75" stroke="#2563eb" strokeWidth="2" />

                    {/* Raw Water Tank */}
                    <rect x="130" y="30" width="90" height="90" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="140" y="45" width="70" height="50" fill="#3b82f6" rx="4" />
                    <line x1="150" y1="50" x2="150" y2="90" stroke="#fff" strokeWidth="3" />
                    <line x1="162" y1="50" x2="162" y2="90" stroke="#fff" strokeWidth="3" />
                    <line x1="174" y1="50" x2="174" y2="90" stroke="#fff" strokeWidth="3" />
                    <line x1="186" y1="50" x2="186" y2="90" stroke="#fff" strokeWidth="3" />
                    <text x="175" y="135" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1e3a8a">RAW WATER TANK</text>

                    <line x1="220" y1="75" x2="260" y2="75" stroke="#2563eb" strokeWidth="2" />

                    {/* EC Chamber */}
                    <rect x="260" y="30" width="90" height="90" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <path d="M 275 60 L 335 60 L 330 95 L 280 95 Z" fill="#2563eb" />
                    <rect x="270" y="55" width="70" height="8" fill="#1e3a8a" rx="2" />
                    <text x="305" y="135" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1e3a8a">EC CHAMBER</text>

                    <line x1="350" y1="75" x2="390" y2="75" stroke="#2563eb" strokeWidth="2" />

                    {/* Settler */}
                    <rect x="390" y="30" width="90" height="90" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <path d="M 410 50 L 460 50 L 460 85 L 435 105 L 410 85 Z" fill="#3b82f6" />
                    <text x="495" y="80" textAnchor="start" fontSize="9" fontWeight="700" fill="#1e3a8a">SETTLER</text>

                    {/* Downwards to clean water & post filtration */}
                    <line x1="435" y1="120" x2="435" y2="150" stroke="#2563eb" strokeWidth="2" />
                    <line x1="435" y1="150" x2="350" y2="150" stroke="#2563eb" strokeWidth="2" />

                    {/* Post Filtration */}
                    <rect x="260" y="135" width="90" height="85" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="280" y="150" width="22" height="50" fill="#3b82f6" rx="2" />
                    <rect x="308" y="150" width="22" height="50" fill="#3b82f6" rx="2" />
                    <text x="305" y="148" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#1e3a8a">POST FILTRATION</text>

                    <line x1="260" y1="175" x2="220" y2="175" stroke="#2563eb" strokeWidth="2" />

                    {/* Clean Water Tank */}
                    <rect x="130" y="135" width="90" height="85" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="140" y="150" width="70" height="45" fill="#3b82f6" rx="4" />
                    <text x="175" y="148" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#1e3a8a">CLEAN WATER TANK</text>

                    {/* Product Water Tank */}
                    <rect x="10" y="140" width="80" height="75" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="20" y="155" width="60" height="40" fill="#3b82f6" rx="4" />
                    <text x="50" y="180" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#1e3a8a">PRODUCT WATER</text>
                    <text x="50" y="195" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#1e3a8a">TANK</text>
                  </svg>
                </div>,
                true
              )}
            </div>

            <div className={styles.sectionHeader}>PROCESS DESCRIPTION</div>
            <p><strong>{proposedModel}</strong> is a five-stage treatment process:</p>
            <ol className={styles.reportList}>
              <li>
                  In the first stage, the wastewater passes through the bar screen chamber to raw water tank 1
                  and overflow to raw water tank 2 wherein aeration is provided. In this stage, <strong>30% reduction in BOD, COD, ammoniacal nitrogen, and pH neutralization</strong> takes place.
                </li>
              <li>
                  The wastewater is lifted from raw water collection tank 2 to the settler via the electrocoagulation chamber.
                  The EC chamber runs on {electrodeMetal === "AL" ? "aluminium" : "iron"} electrodes at power of <strong>{specs?.ec_chamber.operating_power_kw || 0.4} kW</strong> and continuous flow.
                  In this stage, electrical synthesis of waste and electrolysis happens which significantly reduces BOD, COD, and TSS.
                </li>
              <li>
                  The electrocoagulated water flows into settler with a retention time of 1 to 4 hours of capacity <strong>{specs?.settler.volume_m3 ? Math.round(specs.settler.volume_m3 * 1000) : 1000}L</strong>.
                </li>
              <li>
                  Further, the decant water from the settler is taken to the product water tank which is divided internally into multiple units and pumped to the mixed media filter for tertiary treatment.
                </li>
              <li>
                  The treated water from mixed media filter passes through the bag filter of <strong>5 micron</strong> and is stored in the final treated water tank for further reuse or drain.
                </li>
              <li>
                  Sludge from raw water collection tank, settler, and filtration unit is collected in the sludge holding tank.
                </li>
            </ol>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 3</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 5: DESIGN PARAMETERS TABLE & BAR SCREEN                       */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_5"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>DESIGN CALCULATIONS</div>
            <table className={styles.docTable}>
              <thead>
                <tr>
                  <th style={{ width: "50px" }}>Sl No</th>
                  <th>Particulars</th>
                  <th>Anticipated Quality Of Raw Sewage</th>
                  <th>Expected Quality Of Treated Sewage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>pH</td>
                  <td>6 - 8.0</td>
                  <td>6 - 8.5</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>BOD₅ @ 20°C</td>
                  <td>180 - 250 mg/Lit.</td>
                  <td>&lt; 10 Mg/lit.</td>
                </tr>
                <tr>
                  <td>3</td>
                  <td>COD</td>
                  <td>250 - 400 mg/Lit.</td>
                  <td>&lt; 50 Mg/lit.</td>
                </tr>
                <tr>
                  <td>4</td>
                  <td>TSS</td>
                  <td>200 - 400 mg/Lit.</td>
                  <td>&lt; 20 Mg/lit.</td>
                </tr>
                <tr>
                  <td>5</td>
                  <td>TDS</td>
                  <td>1000 - 1250 mg/Lit.</td>
                  <td>&lt; 2100 Mg/lit.</td>
                </tr>
              </tbody>
            </table>
            <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, margin: "4px 0 14px" }}>
              TABLE 1 Design Parameters
            </div>

            <div className={styles.sectionHeader}>TREATMENT METHODOLOGY</div>
            <p>
              The methodology adopted for treatment of sewage is based on pre-treatment process of Extended Aeration
              Activated Sludge Process (EAASP) followed by Electro coagulation and electro-oxidation followed by filtration &amp; disinfection.
              The sludge from the process is collected in sludge holding tank for further compaction.
            </p>
            <p>
              Membrane diffused aeration system is provided in the pre-aeration and aeration units of the pre-treatment tank.
              This will reduce the organic load on the system. The final filtration through mixed media is provided to reduce
              turbidity and suspended solids in the treated sewage.
            </p>

            <div className={styles.sectionHeader}>BAR SCREEN:</div>
            <ul className={styles.reportList}>
              <li><strong>Flow:</strong> {capacityKld} m³ / day ~ {specs?.hydraulics.flow_m3_hr || 0.83} m³/hr</li>
              <li><strong>Size of the Unit:</strong> 0.6 m x 0.6 m x 1 m long</li>
              <li><strong>Function:</strong> To separate coarse matter from the Raw sewage</li>
            </ul>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 4</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 6: OIL & GREASE SEPARATOR, RAW WATER TANKS 1 & 2              */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_6"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>OIL AND GREASE SEPARATOR:</div>
            <ul className={styles.reportList}>
              <li><strong>Flow:</strong> {capacityKld} m³ / day ~ {specs?.hydraulics.flow_m3_hr || 0.83} m³/hr</li>
              <li><strong>Size of the Unit:</strong> In built in Raw water tank 1</li>
              <li><strong>Function:</strong> To Separate Oil &amp; Grease from the Raw Sewage</li>
            </ul>

            <div className={styles.sectionHeader}>RAW WATER TANK 1</div>
            <ul className={styles.reportList}>
              <li><strong>Flow:</strong> {capacityKld} m³ / day ~ {specs?.hydraulics.flow_m3_hr || 0.83} m³/hr</li>
              <li><strong>Size of the Unit:</strong> {specs?.raw_water_tanks.tank_dimensions_mm || "1600mm*1600mm*2500(Depth)"}</li>
              <li><strong>Average BOD of sewage at inlet:</strong> 180-250 mg/l</li>
              <li><strong>Total organic load with 30% BOD reduction:</strong> 54-170 mg/lit.</li>
              <li><strong>Total oxygen required assuming 2 Kgs O₂/kg BOD Removed:</strong> {specs?.raw_water_tanks.o2_required_kg_day || 5.4} Kgs/day</li>
              <li><strong>Air required for pre aeration:</strong> {specs?.raw_water_tanks.air_required_m3_hr || 6.0} m³/hr</li>
              <li><strong>Type of aeration:</strong> Fine bubble diffused aeration system</li>
              <li><strong>Volume of the unit:</strong> {specs?.raw_water_tanks.tank_volume_m3 || 6.0} m³</li>
              <li><strong>Retention time available:</strong> 3.0 Hours during Average flow</li>
              <li><strong>Operating hours:</strong> 8 hrs aeration and 3 hrs rest</li>
            </ul>
            <p style={{ fontStyle: "italic", fontSize: "12px", color: "#475569" }}>
              Note: The aeration is for both mixing and organic load reduction.
            </p>

            <div className={styles.sectionHeader}>RAW WATER TANK 2</div>
            <ul className={styles.reportList}>
              <li><strong>Flow:</strong> {capacityKld} m³ / day ~ {specs?.hydraulics.flow_m3_hr || 0.83} m³/hr</li>
              <li><strong>Size of the Unit:</strong> {specs?.raw_water_tanks.tank_dimensions_mm || "1600mm*1600mm*2500(Depth)"}</li>
              <li><strong>Average BOD of sewage at inlet:</strong> 180-250 mg/l</li>
              <li><strong>Total organic load with 30% BOD reduction:</strong> 54-170 mg/lit.</li>
              <li><strong>Total oxygen required assuming 2 Kgs O₂/kg BOD Removed:</strong> {specs?.raw_water_tanks.o2_required_kg_day || 5.4} Kgs/day</li>
              <li><strong>Air required for pre aeration:</strong> {specs?.raw_water_tanks.air_required_m3_hr || 6.0} m³/hr</li>
              <li><strong>Type of aeration:</strong> Fine bubble diffused aeration system</li>
              <li><strong>Volume of the unit:</strong> {specs?.raw_water_tanks.tank_volume_m3 || 6.0} m³</li>
              <li><strong>Retention time available:</strong> 3.0 Hours during Average flow</li>
              <li><strong>Operating hours:</strong> 8 hrs aeration and 3 hrs rest</li>
            </ul>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 5</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 7: AERATION DIFFUSER SPECS & RAW WATER PUMP                   */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_7"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>DIFFUSER SPECIFICATIONS</div>
            <ul className={styles.reportList}>
              <li><strong>Diffuser Type:</strong> {specs?.raw_water_tanks.diffuser_type || "9\" Membrane Disc Diffuser"}</li>
              <li><strong>Air flow per diffuser:</strong> 3 m³/hr</li>
              <li><strong>Active Diameter:</strong> 225 mm</li>
              <li><strong>Number of diffusers:</strong> {specs?.raw_water_tanks.diffusers_count || 2} Nos</li>
              <li><strong>Material:</strong> EPDM Membrane with Glass-Filled PP Base</li>
            </ul>

            <div className={styles.sectionHeader}>RAW WATER PUMP</div>
            <ul className={styles.reportList}>
              <li><strong>Flow Rate:</strong> {specs?.raw_pump.discharge_m3_hr || 0.83} m³/hr</li>
              <li><strong>Total Dynamic Head:</strong> {specs?.raw_pump.head_m || 10} m</li>
              <li><strong>Power Rating:</strong> {specs?.raw_pump.power_w || 750} W (1.0 HP)</li>
              <li><strong>Pump Type:</strong> Non-clog submersible cutter pump</li>
              <li><strong>Quantity:</strong> 1 Working + 1 Standby (Auto-alternating)</li>
            </ul>

            <div className={styles.sectionHeader}>ELECTROCOAGULATION (EC) DESIGN CRITERIA</div>
            <p>
              Electrocoagulation operates on the principle of in-situ generation of coagulants through electrolytic
              dissolution of sacrificial {electrodeMetal === "AL" ? "Aluminium (Al³⁺)" : "Iron (Fe²⁺)"} anodes.
              When a direct electrical current is passed across the bipolar electrode pack, hydrolysed metal species
              destabilize colloidal suspensions, neutralize surface charges, and form heavy insoluble flocs.
            </p>
            <p>
              Simultaneously, micro-bubbles of hydrogen gas generated at cathode surfaces promote gentle electro-flotation
              of lower-density lipids, grease, and micro-flocs without chemical shearing.
            </p>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 6</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 8: FARADAY CALCULATIONS & REACTOR SIZING                      */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_8"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>1. REACTOR VOLUME &amp; RETENTION TIME</div>
            <div className={styles.formulaBox}>
              Flow rate (Q) = {capacityKld} KLD ÷ {operatingHours} hrs = <strong>{specs?.hydraulics.flow_m3_hr.toFixed(2) || "0.83"} m³/hr</strong> ({specs?.hydraulics.flow_lph || 833} L/hr)<br />
              Hydraulic Retention Time (HRT) = <strong>{specs?.ec_chamber.hrt_minutes || 20} minutes</strong><br />
              Active Liquid Volume (V) = Q × HRT = {specs?.hydraulics.flow_lph || 833} × ({specs?.ec_chamber.hrt_minutes || 20}/60) = <strong>{specs?.ec_chamber.active_volume_l || 278} Litres</strong><br />
              Freeboard Allowance (+20%) = <strong>{specs?.ec_chamber.allowance_l || 56} Litres</strong><br />
              Total Chamber Volume = <strong>{specs?.ec_chamber.total_reactor_volume_l || 334} Litres</strong> ({specs?.ec_chamber.total_reactor_volume_m3.toFixed(2) || "0.33"} m³)
            </div>

            <div className={styles.sectionHeader}>2. ELECTRODE AREA &amp; CONFIGURATION</div>
            <div className={styles.formulaBox}>
              Electrode Metal: <strong>{electrodeMetal === "AL" ? "Aluminium (Grade 6061-T6)" : "Mild Steel (IS 2062)"}</strong><br />
              Plate Dimensions: <strong>{specs?.ec_chamber.plate_dimensions_m || "0.4m (W) × 1.0m (H) × 6mm thick"}</strong><br />
              Inter-Electrode Spacing: <strong>{specs?.ec_chamber.inter_electrode_gap_mm || 8} mm</strong><br />
              Total Active Plates: <strong>{specs?.ec_chamber.plate_count || 12} plates</strong> ({specs?.ec_chamber.plate_count ? specs.ec_chamber.plate_count / 2 : 6} Anodes + {specs?.ec_chamber.plate_count ? specs.ec_chamber.plate_count / 2 : 6} Cathodes)<br />
              Effective Submerged Area: <strong>{((specs?.ec_chamber.plate_count || 12) * 0.4 * 0.85).toFixed(2)} m²</strong><br />
              Operational Current Density (CD): <strong>{specs?.ec_chamber.current_density_a_m2.toFixed(2) || "22.83"} A/m²</strong>
            </div>

            <div className={styles.sectionHeader}>3. FARADAY’S LAW FOR METAL DISSOLUTION</div>
            <div className={styles.formulaBox}>
              Mass dissolved (m) = (I × t × M) ÷ (z × F)<br />
              where I = Operating Current ({specs?.ec_chamber.operating_current_amps.toFixed(1) || "62.4"} A),<br />
              M = Molecular weight ({electrodeMetal === "AL" ? "26.98 g/mol" : "55.85 g/mol"}),<br />
              z = Valence state ({electrodeMetal === "AL" ? "3" : "2"}),<br />
              F = Faraday constant (96,485 C/mol)<br />
              Daily Metal Consumption = <strong>{specs?.ec_chamber.daily_dissolution_kg.toFixed(2) || "0.38"} kg/day</strong><br />
              Electrode Pack Lifespan = <strong>{specs?.ec_chamber.replacement_lifespan_months.toFixed(1) || "12.0"} Months</strong> before replacement
            </div>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 7</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 9: ENERGY & POWER SPECIFICATIONS                              */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_9"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>4. ENERGY CONSUMPTION &amp; POWER RATING</div>
            <div className={styles.formulaBox}>
              Supply DC Voltage: <strong>{supplyVoltage} V DC</strong> (Controlled Switch-Mode Rectifier)<br />
              Operating Current: <strong>{specs?.ec_chamber.operating_current_amps.toFixed(1) || "62.4"} A</strong><br />
              DC Power Draw = V × I = {supplyVoltage} × {specs?.ec_chamber.operating_current_amps.toFixed(1) || "62.4"} = <strong>{specs?.ec_chamber.operating_power_kw.toFixed(2) || "3.00"} kW</strong><br />
              Specific Energy Consumption = Power ÷ Hourly Flow = <strong>{specs?.ec_chamber.specific_energy_kwh_m3.toFixed(2) || "4.21"} kWh/m³</strong><br />
              Total Daily Power Consumption = {specs?.ec_chamber.operating_power_kw.toFixed(2) || "3.00"} kW × {operatingHours} hrs = <strong>{((specs?.ec_chamber.operating_power_kw || 3.0) * operatingHours).toFixed(1)} kWh/day</strong>
            </div>

            <div className={styles.sectionHeader}>GRAVITY CLARIFIER / SETTLER SIZING</div>
            <ul className={styles.reportList}>
              <li><strong>Retention Period:</strong> {specs?.settler.detention_hours || 4} Hours</li>
              <li><strong>Design Settling Capacity:</strong> {specs?.settler.volume_m3.toFixed(2) || "3.33"} m³</li>
              <li><strong>Dimensions:</strong> {specs?.settler.dimensions_m || "1.5m (L) × 1.5m (W) × 1.8m (SWD) with 45° hopper bottom"}</li>
              <li><strong>Sludge Draw-off:</strong> Pneumatic auto-actuated drain valve</li>
            </ul>

            <div className={styles.sectionHeader}>SLUDGE HOLDING TANK</div>
            <ul className={styles.reportList}>
              <li><strong>Daily Sludge Generation:</strong> {specs?.sludge_tank.daily_sludge_l.toFixed(0) || "150"} Litres/day (at 2% solids)</li>
              <li><strong>Storage Holding Volume:</strong> {specs?.sludge_tank.volume_m3.toFixed(2) || "1.00"} m³ (7 days storage)</li>
              <li><strong>Dewatering Compatibility:</strong> Geotextile dewatering bags / filter press</li>
            </ul>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 8</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 10: MIXED MEDIA PRESSURE FILTER & PIPING                      */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_10"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>TERTIARY PRESSURE FILTRATION (MMF)</div>
            <ul className={styles.reportList}>
              <li><strong>Flow Capacity:</strong> {specs?.media_filter.pumping_rate_m3_hr.toFixed(2) || "1.50"} m³/hr</li>
              <li><strong>Vessel Diameter:</strong> {specs?.media_filter.vessel_dia_mm || 400} mm FRP Pentair vessel</li>
              <li><strong>Vessel Shell Height:</strong> {specs?.media_filter.shell_height_mm || 1350} mm</li>
              <li><strong>Filtration Media:</strong> Graded Pebbles, Quartz Sieve Gravel, Silica Sand, Anthracite</li>
              <li><strong>Filtration Surface Loading Rate:</strong> {specs?.media_filter.surface_loading_m3_m2_hr.toFixed(1) || "12.0"} m³/(m²·hr)</li>
              <li><strong>Multiport Valve:</strong> 1.5\" Top-mount automatic multiport valve for backwash</li>
              <li><strong>Feed Pump:</strong> {specs?.media_filter.pump_hp || 0.5} HP Monobloc booster pump</li>
            </ul>

            <div className={styles.sectionHeader}>BAG FILTER / POLISHING CARTRIDGE</div>
            <ul className={styles.reportList}>
              <li><strong>Micron Rating:</strong> {specs?.bag_filter.pore_size_micron || 5} Micron polypropylene spun filter</li>
              <li><strong>Housing:</strong> SS304 single-cartridge pressure housing</li>
              <li><strong>Design Flow:</strong> {specs?.bag_filter.flow_capacity_m3_hr || 2.0} m³/hr</li>
            </ul>

            <div className={styles.sectionHeader}>PRESSURE PIPING &amp; VALVES</div>
            <ul className={styles.reportList}>
              <li><strong>Process Pipe Material:</strong> UPVC Schedule 40 / Schedule 80 ASTM standards</li>
              <li><strong>Sludge Piping:</strong> Heavy duty HDPE Class 6 piping</li>
              <li><strong>Valves:</strong> UPVC industrial ball valves and wafer butterfly valves</li>
            </ul>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 9</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 11: WATER TEST RESULTS & CERTIFICATE OF ANALYSIS              */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_11"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.reportMainTitle}>OPERATIONAL WATER QUALITY REPORT</div>
            <table className={styles.docTable}>
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>Sl No</th>
                  <th>Parameter</th>
                  <th>Raw Sewage</th>
                  <th>Treated Water</th>
                  <th>CPCB / SPCB Norms</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>pH @ 25°C</td>
                  <td>7.42</td>
                  <td>7.28</td>
                  <td>6.5 - 8.5</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>Total Suspended Solids (TSS)</td>
                  <td>248 mg/L</td>
                  <td>&lt; 5 mg/L</td>
                  <td>&lt; 20 mg/L</td>
                </tr>
                <tr>
                  <td>3</td>
                  <td>Biochemical Oxygen Demand (BOD₅)</td>
                  <td>210 mg/L</td>
                  <td>&lt; 6 mg/L</td>
                  <td>&lt; 10 mg/L</td>
                </tr>
                <tr>
                  <td>4</td>
                  <td>Chemical Oxygen Demand (COD)</td>
                  <td>420 mg/L</td>
                  <td>28 mg/L</td>
                  <td>&lt; 50 mg/L</td>
                </tr>
                <tr>
                  <td>5</td>
                  <td>Oil &amp; Grease</td>
                  <td>38 mg/L</td>
                  <td>&lt; 1 mg/L</td>
                  <td>&lt; 5 mg/L</td>
                </tr>
                <tr>
                  <td>6</td>
                  <td>Turbidity</td>
                  <td>180 NTU</td>
                  <td>1.2 NTU</td>
                  <td>&lt; 2.0 NTU</td>
                </tr>
                <tr>
                  <td>7</td>
                  <td>Total Coliform</td>
                  <td>1.4 × 10⁶ MPN</td>
                  <td>Nil / 100 mL</td>
                  <td>&lt; 100 MPN</td>
                </tr>
              </tbody>
            </table>
            <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, margin: "4px 0 16px" }}>
              TABLE 2 Certified Laboratory Water Analysis Results
            </div>

            <p style={{ fontStyle: "italic", fontSize: "12.5px", color: "#334155" }}>
              All tests performed in accordance with standard APHA 23rd Edition testing protocols.
              Treated sewage meets all statutory parameters for flushing, landscape irrigation, and cooling tower make-up.
            </p>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 10</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* PAGE 12: PHOTOGRAPHIC COMPARISON & SUMMARY                         */}
        {/* ================================================================== */}
        <div className={styles.a4Page}>
          <div>
            <div className={styles.pageHeader} contentEditable={false}>
              <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
            </div>

            <EditablePageContent
              pageKey="page_12"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>WATER SAMPLES COMPARISON</div>
            </EditablePageContent>

            {/* Water sample photos OUTSIDE EditablePageContent so React state re-renders work */}
            <div
              contentEditable={false}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "1rem",
                margin: "1rem 0 1.5rem",
                alignItems: "start",
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              {/* Raw Waste Water Sample (Slot 0) */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                  {renderAttachmentFrame(
                    "WATER_BEFORE_AFTER",
                    0,
                    attachments.WATER_BEFORE_AFTER[0]?.previewUrl ? attachments.WATER_BEFORE_AFTER[0] : undefined,
                    "Raw Water Sample",
                    <div
                      style={{
                        width: "140px",
                        height: "210px",
                        background: "linear-gradient(180deg, #3f3f46 0%, #1c1917 100%)",
                        borderRadius: "10px",
                        margin: "10px auto",
                        border: "2px solid #52525b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: 700,
                        textAlign: "center",
                        padding: "12px",
                        lineHeight: "1.4",
                      }}
                    >
                      Raw Sewage<br />(Turbid &amp; Dark)
                    </div>,
                    true
                  )}
                </div>
                <div style={{ marginTop: "8px", fontWeight: 700, fontSize: "14px", color: "var(--color-text)" }}>
                  Raw Waste water
                </div>
              </div>

              {/* Clean / Final Treated Water Sample (Slot 1) */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                  {renderAttachmentFrame(
                    "WATER_BEFORE_AFTER",
                    1,
                    attachments.WATER_BEFORE_AFTER[1]?.previewUrl ? attachments.WATER_BEFORE_AFTER[1] : undefined,
                    "Final Treated Water Sample",
                    <div
                      style={{
                        width: "140px",
                        height: "210px",
                        background: "linear-gradient(180deg, rgba(224,242,254,0.4) 0%, rgba(186,230,253,0.85) 100%)",
                        borderRadius: "10px",
                        margin: "10px auto",
                        border: "2px solid #38bdf8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#0369a1",
                        fontWeight: 700,
                        textAlign: "center",
                        padding: "12px",
                        lineHeight: "1.4",
                      }}
                    >
                      Final Treated<br />(&lt; 2 NTU Crystal)
                    </div>,
                    true
                  )}
                </div>
                <div style={{ marginTop: "8px", fontWeight: 700, fontSize: "14px", color: "var(--color-text)" }}>
                  Final treated water
                </div>
              </div>
            </div>

            <EditablePageContent
              pageKey="page_12_summary"
              isWordMode={effectiveWordMode}
              customContent={customContent}
              onUpdate={handleUpdateCustomContent}
              onReset={handleResetCustomContent}
            >
              <div className={styles.sectionHeader}>Summary</div>
              <p>
                The lab testing was carried out at NABL accredited BARC labs for which 1 litre sample of both raw sewage
                and treated water were provided. The critical parameters list is chosen based on STP guidelines as highlighted
                in the CPCB handbook “Pollution control acts, rules &amp; notifications issued thereunder” or generally termed
                Green Book published vide 2021.
              </p>
              <div className={styles.sectionHeader}>ATTACHMENTS</div>
              <p>
                The operational process flow for {proposedModel} is presented in <strong>Appendix A</strong>.<br />
                The electrical diagram for {proposedModel} is presented in <strong>Appendix B</strong>.<br />
                The installation photographs are attached in <strong>Appendix C</strong>.
              </p>
            </EditablePageContent>
          </div>

          <div className={styles.pageFooter} contentEditable={false}>
            <span className={styles.footerLeft}>To intended recipients only</span>
            <span className={styles.footerRight}>Page | 11</span>
          </div>
        </div>

        {/* ================================================================== */}
        {/* APPENDIX A - PROCESS DIAGRAM (P&ID) - Supports Multiple Sheets       */}
        {/* ================================================================== */}
        {attachments.PROCESS_DIAGRAM.length === 0 ? (
          <div className={styles.a4Page}>
            <div>
              <div className={styles.pageHeader} contentEditable={false}>
                <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
              </div>

              <EditablePageContent
                pageKey="page_13"
                isWordMode={effectiveWordMode}
                customContent={customContent}
                onUpdate={handleUpdateCustomContent}
                onReset={handleResetCustomContent}
              >
                <div className={styles.reportMainTitle}>APPENDIX A</div>
                <div className={styles.subSectionHeader} style={{ textAlign: "center", marginBottom: "1rem" }}>
                  Process Diagram {proposedModel}
                </div>

                {renderAttachmentFrame(
                  "PROCESS_DIAGRAM",
                  0,
                  undefined,
                  "Process Diagram P&ID",
                  <svg width="650" height="350" viewBox="0 0 650 350" style={{ maxWidth: "100%" }}>
                    <rect x="20" y="40" width="100" height="90" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="45" y="60" width="25" height="50" fill="#3b82f6" />
                    <rect x="75" y="75" width="20" height="35" fill="#1d4ed8" />
                    <text x="70" y="145" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e3a8a">LIFTING STATION</text>

                    <line x1="120" y1="85" x2="160" y2="85" stroke="#2563eb" strokeWidth="2" />

                    <rect x="160" y="30" width="110" height="110" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="175" y="50" width="80" height="60" fill="#3b82f6" rx="4" />
                    <text x="215" y="155" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e3a8a">RAW WATER TANK</text>

                    <line x1="270" y1="85" x2="310" y2="85" stroke="#2563eb" strokeWidth="2" />

                    <rect x="310" y="30" width="110" height="110" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <path d="M 330 60 L 400 60 L 390 110 L 340 110 Z" fill="#2563eb" />
                    <rect x="325" y="55" width="80" height="10" fill="#1e3a8a" rx="2" />
                    <text x="365" y="155" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e3a8a">EC CHAMBER</text>

                    <line x1="420" y1="85" x2="470" y2="85" stroke="#2563eb" strokeWidth="2" />

                    <rect x="470" y="30" width="110" height="110" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <path d="M 495 50 L 555 50 L 555 90 L 525 120 L 495 90 Z" fill="#3b82f6" />
                    <text x="525" y="155" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e3a8a">SETTLER</text>

                    {/* Bottom line */}
                    <line x1="525" y1="140" x2="525" y2="200" stroke="#2563eb" strokeWidth="2" />
                    <line x1="525" y1="200" x2="420" y2="200" stroke="#2563eb" strokeWidth="2" />

                    <rect x="310" y="180" width="110" height="110" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="335" y="200" width="25" height="65" fill="#3b82f6" rx="2" />
                    <rect x="370" y="200" width="25" height="65" fill="#3b82f6" rx="2" />
                    <text x="365" y="195" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1e3a8a">POST FILTRATION</text>

                    <line x1="310" y1="235" x2="270" y2="235" stroke="#2563eb" strokeWidth="2" />

                    <rect x="160" y="180" width="110" height="110" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <rect x="175" y="200" width="80" height="60" fill="#3b82f6" rx="4" />
                    <text x="215" y="195" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1e3a8a">CLEAN WATER TANK</text>

                    <rect x="20" y="180" width="100" height="110" fill="#f8fafc" stroke="#2563eb" strokeDasharray="3,3" strokeWidth="1.5" />
                    <text x="70" y="235" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1e3a8a">PRODUCT WATER</text>
                    <text x="70" y="250" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1e3a8a">TANK</text>
                  </svg>
                )}
              </EditablePageContent>
            </div>

            <div className={styles.pageFooter} contentEditable={false}>
              <span className={styles.footerLeft}>To intended recipients only</span>
              <span className={styles.footerRight}>Page | 12</span>
            </div>
          </div>
        ) : (
          attachments.PROCESS_DIAGRAM.map((att, idx) => (
            <div key={`app-a-sheet-${idx}`} className={styles.a4Page}>
              <div>
                <div className={styles.pageHeader} contentEditable={false}>
                  <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
                </div>

                <div className={styles.reportMainTitle}>APPENDIX A</div>
                <div className={styles.subSectionHeader} style={{ textAlign: "center", marginBottom: "1rem" }}>
                  Process Diagram {proposedModel}
                  {attachments.PROCESS_DIAGRAM.length > 1
                    ? ` — Sheet ${idx + 1} of ${attachments.PROCESS_DIAGRAM.length}`
                    : ""}
                </div>

                {renderAttachmentFrame(
                  "PROCESS_DIAGRAM",
                  idx,
                  att,
                  `Process Diagram P&ID (Sheet ${idx + 1})`
                )}
              </div>

              <div className={styles.pageFooter} contentEditable={false}>
                <span className={styles.footerLeft}>To intended recipients only</span>
                <span className={styles.footerRight}>Page | {11 + idx + 1}</span>
              </div>
            </div>
          ))
        )}

        {/* ================================================================== */}
        {/* APPENDIX B - ELECTRICAL SCHEMATIC - Supports Multiple Sheets        */}
        {/* ================================================================== */}
        {attachments.ELECTRICAL_DIAGRAM.length === 0 ? (
          <div className={styles.a4Page}>
            <div>
              <div className={styles.pageHeader} contentEditable={false}>
                <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
              </div>

              <EditablePageContent
                pageKey="page_14"
                isWordMode={effectiveWordMode}
                customContent={customContent}
                onUpdate={handleUpdateCustomContent}
                onReset={handleResetCustomContent}
              >
                <div className={styles.reportMainTitle}>APPENDIX B</div>
                <p><strong>Electrical Diagram: Enclosed (Power Panel - Folio 1/5)</strong></p>

                {renderAttachmentFrame(
                  "ELECTRICAL_DIAGRAM",
                  0,
                  undefined,
                  "Electrical Circuit Schematic",
                  <svg width="650" height="340" viewBox="0 0 650 340" style={{ maxWidth: "100%" }}>
                    <rect x="5" y="5" width="640" height="330" fill="none" stroke="#000" strokeWidth="1.5" />
                    <line x1="5" y1="35" x2="645" y2="35" stroke="#000" strokeWidth="1" />
                    <text x="20" y="25" fontSize="11" fontWeight="700">1</text>
                    <text x="80" y="25" fontSize="11" fontWeight="700">2</text>
                    <text x="140" y="25" fontSize="11" fontWeight="700">3</text>
                    <text x="200" y="25" fontSize="11" fontWeight="700">4</text>
                    <text x="280" y="25" fontSize="11" fontWeight="700">5</text>
                    <text x="360" y="25" fontSize="11" fontWeight="700">6</text>
                    <text x="440" y="25" fontSize="11" fontWeight="700">7</text>
                    <text x="520" y="25" fontSize="11" fontWeight="700">8</text>

                    {/* Circuit breakers and contactors */}
                    <rect x="30" y="60" width="70" height="70" fill="#fff" stroke="#000" strokeWidth="1.5" />
                    <text x="65" y="95" textAnchor="middle" fontSize="9" fontWeight="700">Load breaker</text>
                    <text x="65" y="110" textAnchor="middle" fontSize="9">switch</text>

                    <rect x="180" y="60" width="80" height="60" fill="#fff" stroke="#000" strokeWidth="1.5" />
                    <text x="220" y="95" textAnchor="middle" fontSize="10" fontWeight="700">63A MCB</text>

                    <rect x="360" y="60" width="90" height="65" fill="#fff" stroke="#000" strokeWidth="1.5" />
                    <text x="405" y="90" textAnchor="middle" fontSize="9" fontWeight="700">18A Contactor</text>
                    <text x="405" y="105" textAnchor="middle" fontSize="8">1L1 3L1 5L3 13NC</text>

                    <rect x="500" y="55" width="80" height="90" fill="#fff" stroke="#dc2626" strokeWidth="1.5" />
                    <text x="540" y="85" textAnchor="middle" fontSize="9" fontWeight="700" fill="#dc2626">24V 5A SMPS</text>
                    <text x="540" y="110" textAnchor="middle" fontSize="8">+   -   N L E</text>

                    {/* Wiring lines */}
                    <line x1="65" y1="130" x2="65" y2="280" stroke="#16a34a" strokeWidth="2.5" />
                    <text x="65" y="300" textAnchor="middle" fontSize="9" fontWeight="700" fill="#16a34a">EARTH</text>

                    <line x1="130" y1="130" x2="130" y2="280" stroke="#0284c7" strokeWidth="2.5" />
                    <text x="130" y="300" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0284c7">NEUTRAL</text>

                    <line x1="220" y1="120" x2="220" y2="280" stroke="#dc2626" strokeWidth="2.5" />
                    <text x="220" y="300" textAnchor="middle" fontSize="9" fontWeight="700" fill="#dc2626">LINE</text>

                    {/* Footer metadata box */}
                    <line x1="5" y1="310" x2="645" y2="310" stroke="#000" strokeWidth="1" />
                    <text x="15" y="325" fontSize="8.5" fontWeight="700">Author: XPREDICT DIGITAL CONTROLS</text>
                    <text x="260" y="325" fontSize="8.5">Read the instruction before use</text>
                    <text x="480" y="325" fontSize="8.5" fontWeight="700">File: {capacityKld}KLD POWER PANEL (1/5)</text>
                  </svg>
                )}
              </EditablePageContent>
            </div>

            <div className={styles.pageFooter} contentEditable={false}>
              <span className={styles.footerLeft}>To intended recipients only</span>
              <span className={styles.footerRight}>Page | {11 + appendixACount + 1}</span>
            </div>
          </div>
        ) : (
          attachments.ELECTRICAL_DIAGRAM.map((att, idx) => (
            <div key={`app-b-sheet-${idx}`} className={styles.a4Page}>
              <div>
                <div className={styles.pageHeader} contentEditable={false}>
                  <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
                </div>

                <div className={styles.reportMainTitle}>APPENDIX B</div>
                <p>
                  <strong>
                    Electrical Diagram: Enclosed (Power Panel - Folio {idx + 1}/
                    {attachments.ELECTRICAL_DIAGRAM.length})
                  </strong>
                </p>

                {renderAttachmentFrame(
                  "ELECTRICAL_DIAGRAM",
                  idx,
                  att,
                  `Electrical Circuit Schematic (Sheet ${idx + 1})`
                )}
              </div>

              <div className={styles.pageFooter} contentEditable={false}>
                <span className={styles.footerLeft}>To intended recipients only</span>
                <span className={styles.footerRight}>
                  Page | {11 + appendixACount + idx + 1}
                </span>
              </div>
            </div>
          ))
        )}

        {/* ================================================================== */}
        {/* APPENDIX C - INSTALLATION PHOTO - Supports Multiple Photos         */}
        {/* ================================================================== */}
        {attachments.INSTALLATION_PHOTO.length === 0 ? (
          <div className={styles.a4Page}>
            <div>
              <div className={styles.pageHeader} contentEditable={false}>
                <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
              </div>

              <EditablePageContent
                pageKey="page_15"
                isWordMode={effectiveWordMode}
                customContent={customContent}
                onUpdate={handleUpdateCustomContent}
                onReset={handleResetCustomContent}
              >
                <div className={styles.reportMainTitle}>APPENDIX C</div>
                <div className={styles.subSectionHeader} style={{ textAlign: "center", marginBottom: "1rem" }}>
                  Machine Installation &amp; Site Photo
                </div>

                {renderAttachmentFrame(
                  "INSTALLATION_PHOTO",
                  0,
                  undefined,
                  "Machine Installation Site Photo",
                  <div style={{ textAlign: "center", margin: "1.5rem 0" }}>
                    <div style={{ width: "380px", height: "260px", margin: "0 auto", border: "2px dashed #94a3b8", borderRadius: "8px", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏭</div>
                      <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: "1.1rem" }}>
                        {proposedModel} Plant
                      </div>
                      <div style={{ color: "#475569", fontSize: "0.85rem", marginTop: "4px" }}>
                        Commissioned at {siteName}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "6px" }}>
                        Click "Upload Custom" above to attach actual site photo
                      </div>
                    </div>
                  </div>
                )}

                <p style={{ textAlign: "center", fontStyle: "italic", fontSize: "12px", color: "#64748b" }}>
                  Compact mobile skid footprint ({specs?.footprint.total_area_sqft || 200} sqft), fully automated PLC operation.
                </p>
              </EditablePageContent>
            </div>

            <div className={styles.pageFooter} contentEditable={false}>
              <span className={styles.footerLeft}>To intended recipients only</span>
              <span className={styles.footerRight}>
                Page | {11 + appendixACount + appendixBCount + 1}
              </span>
            </div>
          </div>
        ) : (
          attachments.INSTALLATION_PHOTO.map((att, idx) => (
            <div key={`app-c-photo-${idx}`} className={styles.a4Page}>
              <div>
                <div className={styles.pageHeader} contentEditable={false}>
                  <img src={logoSvg} alt="Xpredict LABS" className={styles.headerLogo} />
                </div>

                <div className={styles.reportMainTitle}>APPENDIX C</div>
                <div className={styles.subSectionHeader} style={{ textAlign: "center", marginBottom: "1rem" }}>
                  Machine Installation &amp; Site Photo
                  {attachments.INSTALLATION_PHOTO.length > 1
                    ? ` (${idx + 1} of ${attachments.INSTALLATION_PHOTO.length})`
                    : ""}
                </div>

                {renderAttachmentFrame(
                  "INSTALLATION_PHOTO",
                  idx,
                  att,
                  `Machine Installation Site Photo (${idx + 1})`
                )}

                <p style={{ textAlign: "center", fontStyle: "italic", fontSize: "12px", color: "#64748b", marginTop: "1rem" }}>
                  Compact mobile skid footprint ({specs?.footprint.total_area_sqft || 200} sqft), fully automated PLC operation.
                </p>
              </div>

              <div className={styles.pageFooter} contentEditable={false}>
                <span className={styles.footerLeft}>To intended recipients only</span>
                <span className={styles.footerRight}>
                  Page | {11 + appendixACount + appendixBCount + idx + 1}
                </span>
              </div>
            </div>
          ))
        )}

        </div>
      </main>
    </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmState?.open)}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
        cancelLabel={confirmState?.cancelLabel ?? "Cancel"}
        intent={confirmState?.intent ?? "primary"}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
