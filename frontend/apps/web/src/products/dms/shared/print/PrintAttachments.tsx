/**
 * Attachments, printed WITH the report they belong to.
 *
 * A report's attachments used to print as file-name chips only. Images can
 * simply be printed; a PDF cannot -- browsers print an embedded PDF blank --
 * so each PDF page is drawn to an image with pdf.js first. That takes a
 * moment, so the view prepares them when it opens and its Print button waits
 * for `ready`, which is also what makes Ctrl+P safe once it is.
 *
 * Everything here is invisible on screen (`data-print-only`) and appears only
 * on paper, after the report itself, one attachment per page.
 */

import { useEffect, useMemo, useState } from "react";

export interface PrintableFile {
  url: string;
  name: string;
}

type Prepared =
  | { name: string; kind: "image"; src: string }
  | { name: string; kind: "pdf"; pages: string[]; totalPages: number }
  | { name: string; kind: "other" }
  | { name: string; kind: "failed" };

/** Enough for any real report; a 300-page manual should be printed on its own. */
const MAX_PDF_PAGES = 30;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i;
const PDF = /\.pdf(\?|$)/i;

/** The attachments of a service report, water report or complaint, whatever shape they came in. */
export function filesOf(record: { attachments?: unknown; attachment?: unknown } | null | undefined): PrintableFile[] {
  if (!record) return [];
  const list = Array.isArray(record.attachments) ? record.attachments : [];
  const files = list
    .map((att: any) => {
      const url = typeof att === "string" ? att : att?.file;
      if (!url || typeof url !== "string") return null;
      return { url, name: att?.file_name || url.split("/").pop() || "attachment" };
    })
    .filter(Boolean) as PrintableFile[];
  if (files.length === 0 && typeof record.attachment === "string" && record.attachment) {
    files.push({ url: record.attachment, name: record.attachment.split("/").pop() || "attachment" });
  }
  return files;
}

function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = url;
  });
}

async function renderPdf(url: string): Promise<{ pages: string[]; totalPages: number }> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ url, withCredentials: true });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push(canvas.toDataURL("image/jpeg", 0.85));
      page.cleanup();
    }
    return { pages, totalPages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/** Prepare `files` for printing. `ready` turns true once every one is drawn (or has failed). */
export function usePrintAttachments(files: PrintableFile[]): { prepared: Prepared[]; ready: boolean } {
  const key = useMemo(() => files.map((f) => f.url).join("|"), [files]);
  const [state, setState] = useState<{ key: string; prepared: Prepared[] }>({ key: "", prepared: [] });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prepared = await Promise.all(
        files.map(async (f): Promise<Prepared> => {
          try {
            if (IMAGE.test(f.url) || IMAGE.test(f.name)) {
              await loadImage(f.url);
              return { name: f.name, kind: "image", src: f.url };
            }
            if (PDF.test(f.url) || PDF.test(f.name)) {
              const { pages, totalPages } = await renderPdf(f.url);
              return { name: f.name, kind: "pdf", pages, totalPages };
            }
            return { name: f.name, kind: "other" };
          } catch {
            return { name: f.name, kind: "failed" };
          }
        }),
      );
      if (!cancelled) setState({ key, prepared });
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands for `files`: a new array with the same files is not new work.
  }, [key]);

  return { prepared: state.key === key ? state.prepared : [], ready: state.key === key };
}

const pageStyle: React.CSSProperties = { breakBefore: "page", pageBreakBefore: "always" };
const titleStyle: React.CSSProperties = { fontSize: "0.9rem", fontWeight: 700, margin: "0 0 8px" };
const imgStyle: React.CSSProperties = { display: "block", width: "100%", height: "auto", marginBottom: "8px" };
const noteStyle: React.CSSProperties = { fontSize: "0.8rem", color: "#475569" };

/** The printed appendix. Put it inside the `data-print-document` element, after the report. */
export function PrintAttachments({ prepared }: { prepared: Prepared[] }) {
  if (prepared.length === 0) return null;
  return (
    <div data-print-only>
      {prepared.map((item, i) => (
        <section key={`${item.name}-${i}`} style={pageStyle}>
          <h4 style={titleStyle}>
            Attachment {i + 1} of {prepared.length}: {item.name}
          </h4>
          {item.kind === "image" && <img src={item.src} alt={item.name} style={imgStyle} />}
          {item.kind === "pdf" && (
            <>
              {item.pages.map((src, p) => (
                <img key={p} src={src} alt={`${item.name} page ${p + 1}`} style={{ ...imgStyle, ...(p > 0 ? pageStyle : {}) }} />
              ))}
              {item.totalPages > item.pages.length && (
                <p style={noteStyle}>
                  Pages {item.pages.length + 1}–{item.totalPages} are not printed here; print the file itself for those.
                </p>
              )}
            </>
          )}
          {item.kind === "other" && <p style={noteStyle}>This file type cannot be printed here. Print it from its own program.</p>}
          {item.kind === "failed" && <p style={noteStyle}>This file could not be loaded for printing.</p>}
        </section>
      ))}
    </div>
  );
}
