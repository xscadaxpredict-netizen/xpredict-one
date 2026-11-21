/**
 * View an uploaded document without leaving the page, and download it.
 *
 * Files are served from /media/ on the app's own origin (Vite proxies it in
 * development, Nginx serves it in production with X-Frame-Options SAMEORIGIN),
 * so a PDF or image can be shown in a frame here and `download` saves it
 * straight to disk instead of opening a new tab.
 */

import { useEffect, useRef } from "react";
import styles from "./DocumentViewerDialog.module.css";

interface DocumentViewerDialogProps {
  title: string;
  fileName: string;
  fileUrl: string;
  onClose: () => void;
}

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const PDF = /\.pdf$/i;

export function DocumentViewerDialog({ title, fileName, fileUrl, onClose }: DocumentViewerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const name = fileName || fileUrl.split("/").pop() || "document";
  const isPdf = PDF.test(name) || PDF.test(fileUrl);
  const isImage = IMAGE.test(name) || IMAGE.test(fileUrl);

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} aria-label={title}>
      <div className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.fileName}>{name}</span>
        </div>
        <div className={styles.actions}>
          <a className={styles.btnPrimary} href={fileUrl} download={name}>
            Download
          </a>
          <button type="button" className={styles.btnClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>
      <div className={styles.body}>
        {isPdf ? (
          <iframe className={styles.frame} src={fileUrl} title={title} />
        ) : isImage ? (
          <img className={styles.image} src={fileUrl} alt={title} />
        ) : (
          <div className={styles.noPreview}>
            <p>This file type can't be previewed in the browser.</p>
            <a className={styles.btnPrimary} href={fileUrl} download={name}>
              Download {name}
            </a>
          </div>
        )}
      </div>
    </dialog>
  );
}
