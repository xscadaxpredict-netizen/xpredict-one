import { useState, useEffect } from "react";
import { FileTextIcon, DownloadIcon, EyeIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import styles from "./FileAttachmentCell.module.css";

interface Props {
  attachment?: string | null;
  label?: string;
  showPreviewModalOnly?: boolean;
}

export function FileAttachmentCell({ attachment }: Props) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const cleanPath = attachment ? (attachment.split("?")[0] || "") : "";
  const rawFileName = cleanPath.split("/").pop() || "attachment";
  let fileName = rawFileName;
  try {
    fileName = decodeURIComponent(rawFileName);
  } catch (e) {
    fileName = rawFileName;
  }

  const fileUrl = !attachment
    ? ""
    : attachment.startsWith("http")
    ? attachment
    : attachment.startsWith("/")
    ? attachment
    : `/${attachment}`;

  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName) || (attachment ? attachment.startsWith("data:image") : false);
  const isPdf = /\.pdf$/i.test(fileName);

  useEffect(() => {
    let activeBlobUrl = "";
    if (isPreviewOpen && isPdf && fileUrl) {
      setPdfLoading(true);
      fetch(fileUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const pdfBlob = new Blob([blob], { type: "application/pdf" });
          activeBlobUrl = URL.createObjectURL(pdfBlob);
          setPdfBlobUrl(activeBlobUrl);
        })
        .catch(() => {
          setPdfBlobUrl(fileUrl);
        })
        .finally(() => {
          setPdfLoading(false);
        });
    } else {
      setPdfBlobUrl(null);
    }

    return () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [isPreviewOpen, isPdf, fileUrl]);

  if (!attachment) {
    return <span className={styles.noAttachment}>No Attachment</span>;
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(fileUrl, "_blank");
    }
  };

  const handleOpenNewTab = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, "_blank");
    } else {
      window.open(fileUrl, "_blank");
    }
  };

  return (
    <>
      <div className={styles.container}>
        <div
          className={styles.attachmentBadge}
          onClick={() => setIsPreviewOpen(true)}
          title={`Click to preview ${fileName}`}
        >
          {isImage ? (
            <img src={fileUrl} alt={fileName} className={styles.thumbnail} />
          ) : (
            <FileTextIcon size={16} style={{ color: "#3b82f6", flexShrink: 0 }} />
          )}
          <span className={styles.fileName}>{fileName}</span>
        </div>

        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => setIsPreviewOpen(true)}
          title="Preview File"
        >
          <EyeIcon size={14} />
        </button>

        <button
          type="button"
          className={styles.actionBtn}
          title="Download File"
          onClick={handleDownload}
        >
          <DownloadIcon size={14} />
        </button>
      </div>

      {isPreviewOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsPreviewOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle} title={fileName}>
                {fileName}
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsPreviewOpen(false)}
              >
                <XIcon size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {isImage ? (
                <img src={fileUrl} alt={fileName} className={styles.previewImage} />
              ) : isPdf ? (
                pdfLoading ? (
                  <div className={styles.genericFileBox}>
                    <FileTextIcon size={40} style={{ color: "#2563eb", animation: "pulse 1s infinite" }} />
                    <div style={{ fontWeight: 500, color: "#334155" }}>Loading PDF Preview...</div>
                  </div>
                ) : (
                  <iframe
                    src={pdfBlobUrl || fileUrl}
                    title={fileName}
                    className={styles.previewIframe}
                  />
                )
              ) : (
                <div className={styles.genericFileBox}>
                  <FileTextIcon size={48} style={{ color: "#64748b" }} />
                  <div>{fileName}</div>
                  <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                    Preview not available for this file format. You can download or open it in a new tab.
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={handleOpenNewTab}
                className={styles.btnSecondary}
              >
                <ExternalLinkIcon size={14} /> Open in New Tab
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className={styles.btnPrimary}
              >
                <DownloadIcon size={14} /> Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
