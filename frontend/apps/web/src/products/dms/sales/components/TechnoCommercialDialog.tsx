import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UploadCloudIcon, FileTextIcon, XIcon } from "lucide-react";
import type { TechnoCommercialDocument } from "../api/technoCommercial";
import { listSites } from "../../site-services/api/siteServices";
import styles from "./TechnoCommercialDialog.module.css";

interface TechnoCommercialDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
  initialData?: TechnoCommercialDocument | null;
}

export function TechnoCommercialDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  initialData,
}: TechnoCommercialDialogProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sites = [] } = useQuery({
    queryKey: ["confirmed-sites", orgSlug],
    queryFn: () => listSites(orgSlug || ""),
    enabled: Boolean(orgSlug && open),
  });

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [siteName, setSiteName] = useState<string>("");
  const [isCustomSite, setIsCustomSite] = useState<boolean>(false);
  const [quoteNumber, setQuoteNumber] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setTitle(initialData.title || "");
        setNotes(initialData.notes || "");
        setSelectedSiteId(initialData.site || "");
        setSiteName(initialData.site_name || "");
        setQuoteNumber(initialData.quote_number || "");
        setIsCustomSite(!initialData.site && Boolean(initialData.site_name));
        setSelectedFile(null);
      } else {
        setTitle("");
        setNotes("");
        setSelectedSiteId("");
        setSiteName("");
        setQuoteNumber("");
        setIsCustomSite(false);
        setSelectedFile(null);
      }
      setFormError("");
    }
  }, [open, initialData]);

  const handleSiteSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "__custom__") {
      setIsCustomSite(true);
      setSelectedSiteId("");
    } else if (val) {
      setIsCustomSite(false);
      setSelectedSiteId(val);
      const matched = sites.find((s) => s.id === val);
      if (matched) {
        const name = matched.site_name || matched.customer_name || "";
        setSiteName(name);
        if (matched.quotes && matched.quotes.length > 0 && !quoteNumber) {
          setQuoteNumber(matched.quotes[0]?.quote_no || "");
        }
      }
    } else {
      setIsCustomSite(false);
      setSelectedSiteId("");
      setSiteName("");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!title) {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setTitle(baseName);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setTitle(baseName);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!title.trim()) {
      setFormError("Document title is required.");
      return;
    }

    if (!initialData && !selectedFile) {
      setFormError("Please select a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("notes", notes.trim());

    if (selectedSiteId) {
      formData.append("site", selectedSiteId);
    }
    if (siteName.trim()) {
      formData.append("site_name", siteName.trim());
    }
    if (quoteNumber.trim()) {
      formData.append("quote_number", quoteNumber.trim());
    }

    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    onSubmit(formData);
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          {initialData ? "Edit Document" : "Upload Techno-Commercial Document"}
        </h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close dialog">
          <XIcon size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.body}>
          {formError && <div className={styles.errorBanner}>{formError}</div>}

          {/* File Upload Zone */}
          <div className={styles.field}>
            <label className={styles.label}>
              Document File {!initialData && <span className={styles.required}>*</span>}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
            />

            {selectedFile ? (
              <div className={styles.filePreview}>
                <div className={styles.fileInfo}>
                  <FileTextIcon size={24} className={styles.dropzoneIcon} />
                  <div>
                    <div className={styles.fileName}>{selectedFile.name}</div>
                    <div className={styles.fileMeta}>Selected for upload</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.removeFileBtn}
                  onClick={() => setSelectedFile(null)}
                  title="Remove selected file"
                >
                  <XIcon size={16} />
                </button>
              </div>
            ) : initialData?.file_name ? (
              <div className={styles.filePreview}>
                <div className={styles.fileInfo}>
                  <FileTextIcon size={24} className={styles.dropzoneIcon} />
                  <div>
                    <div className={styles.fileName}>{initialData.file_name}</div>
                    <div className={styles.fileMeta}>Current file &bull; Click replace to change</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </button>
              </div>
            ) : (
              <div
                className={`${styles.dropzone} ${isDragging ? styles.dropzoneDragging : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloudIcon size={32} className={styles.dropzoneIcon} />
                <p className={styles.dropzoneText}>
                  Drag and drop document here, or <span style={{ color: "var(--color-primary)", textDecoration: "underline" }}>browse</span>
                </p>
                <p className={styles.dropzoneSubtext}>
                  PDF, DOCX, XLSX, Images up to 25 MB
                </p>
              </div>
            )}
          </div>

          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="tc-title">
              Document Title <span className={styles.required}>*</span>
            </label>
            <input
              id="tc-title"
              className={styles.input}
              type="text"
              placeholder="e.g. Techno-Commercial Proposal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Installation Site / Customer Selection */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="tc-site">
              Installation Site / Customer
            </label>
            <select
              id="tc-site"
              className={styles.select}
              value={isCustomSite ? "__custom__" : selectedSiteId}
              onChange={handleSiteSelect}
            >
              <option value="">-- General / No Specific Site Linked --</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_name || "Site"} — {site.customer_name} {site.oc_number ? `(OC: ${site.oc_number})` : ""}
                </option>
              ))}
              <option value="__custom__">+ Enter Custom Site / Prospective Customer</option>
            </select>
          </div>

          {(isCustomSite || (!selectedSiteId && siteName)) && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="tc-custom-site">
                Custom Site / Customer Name
              </label>
              <input
                id="tc-custom-site"
                type="text"
                className={styles.input}
                placeholder="e.g. Phoenix Mall, Prestige Tech Park, etc."
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
            </div>
          )}

          {/* Quotation Reference */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="tc-quote">
              Quotation Reference # (Optional)
            </label>
            <input
              id="tc-quote"
              type="text"
              className={styles.input}
              placeholder="e.g. QT-2026-0042"
              value={quoteNumber}
              onChange={(e) => setQuoteNumber(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="tc-notes">
              Notes (Optional)
            </label>
            <textarea
              id="tc-notes"
              className={styles.textarea}
              rows={3}
              placeholder="Any remarks or description..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="submit" className={styles.btnPrimary} disabled={isPending}>
            {isPending ? "Saving..." : initialData ? "Update Document" : "Upload Document"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
