/**
 * DMS settings -> Masters -> USER MANUALS and MACHINE VIDEOS, one page in the
 * shared list format (C78) for both: the two libraries Tech Support reads,
 * uploaded here. Title, category and file in a table; Open, Download, Edit and
 * Delete on each row's ⋮.
 *
 * Were two tabs of "Load Master Data" (moved and restyled 2026-11-25). The
 * upload dialogs are Tech Support's own, unchanged.
 */

import { useState } from "react";
import {
  ConfirmDialog,
  ListFilter,
  RowMenu,
  TableSkeleton,
  listPageStyles as listStyles,
} from "@xpredict/ui";

import { useShellContext } from "../../../shell/context";
import { usePageSearch } from "../../../stores/pageSearchStore";
import { useTechSupport } from "../tech-support/api/techSupport";
import type { MachineVideo, UserManual } from "../tech-support/api/types";
import { UploadManualDialog } from "../tech-support/components/UploadManualDialog";
import { UploadVideoDialog } from "../tech-support/components/UploadVideoDialog";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import { PlusIcon } from "./icons";
import styles from "./Masters.module.css";

type Kind = "manual" | "video";
type Item = UserManual | MachineVideo;

const WORDS: Record<Kind, { title: string; one: string; many: string; add: string }> = {
  manual: { title: "User Manuals", one: "manual", many: "manuals", add: "Upload Manual" },
  video: { title: "Machine Videos", one: "video", many: "videos", add: "Upload Video" },
};

export function LibraryPage({ kind }: { kind: Kind }) {
  const { membership } = useShellContext();
  const library = useTechSupport(membership.org_slug);
  const permissions = useDmsPermissions();
  const query = usePageSearch((state) => state.query);
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [deleting, setDeleting] = useState<Item | null>(null);

  const words = WORDS[kind];
  const items: Item[] = kind === "manual" ? library.manuals : library.videos;
  const pending = kind === "manual" ? library.manualsPending : library.videosPending;
  const canUpload = kind === "manual" ? permissions.canUploadManual : permissions.canUploadVideo;
  const canDelete = kind === "manual" ? permissions.canDeleteManual : permissions.canDeleteVideo;

  const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort();
  const filters = [
    { value: "all", label: "All categories" },
    ...categories.map((name) => ({ value: name, label: name })),
  ];
  const shown = items.filter(
    (item) => (category === "all" || item.category === category) && matches(item, query),
  );

  const open = (item: Item | "new") => {
    setForm(item === "new" ? {} : { ...item });
    setEditing(item);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) {
      if (key !== "file" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        data.append(key, String(value));
      }
    }
    const files = form.file as FileList | string | undefined;
    const chosen = files && typeof files !== "string" ? files[0] : undefined;
    if (chosen) data.append("file", chosen);
    else if (editing === "new") {
      window.alert("Please select a file to upload.");
      return;
    }
    if (kind === "manual") library.uploadManual(data);
    else library.uploadVideo(data);
    setEditing(null);
  };

  const Dialog = kind === "manual" ? UploadManualDialog : UploadVideoDialog;

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>{words.title}</h1>
      </div>

      <div className={listStyles.toolbar}>
        <ListFilter id={`${kind}-category`} value={category} options={filters} onChange={setCategory} />
        {!pending && (
          <span className={listStyles.count} aria-live="polite">
            {shown.length === 1 ? `1 ${words.one}` : `${String(shown.length)} ${words.many}`}
          </span>
        )}
        <span className={listStyles.spacer} />
        <button
          type="button"
          className={listStyles.primaryButton}
          aria-disabled={canUpload ? undefined : "true"}
          title={canUpload ? undefined : `You do not have permission to upload ${words.many}`}
          onClick={() => canUpload && open("new")}
        >
          <PlusIcon />
          {words.add}
        </button>
      </div>

      <div className={listStyles.listArea}>
        {pending ? (
          <TableSkeleton label={words.many} columns={[280, 160, 220, 56]} rows={4} />
        ) : (
          <div className={listStyles.tableWrap}>
            <table className={listStyles.table}>
              <caption className={listStyles.visuallyHidden}>{words.title} that Tech Support offers.</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col">File</th>
                  <th scope="col" className={listStyles.actions}>
                    <span className={listStyles.visuallyHidden}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      <div className={listStyles.stack}>
                        <span className={listStyles.primary}>{item.title}</span>
                        {item.description && <span className={listStyles.sub}>{item.description}</span>}
                      </div>
                    </th>
                    <td>{item.category || <span className={listStyles.none}>—</span>}</td>
                    <td>
                      <div className={listStyles.stack}>
                        <span>{item.file_name || <span className={listStyles.none}>—</span>}</span>
                        <span className={`${listStyles.sub} ${styles.muted}`}>{fileDetail(item)}</span>
                      </div>
                    </td>
                    <td className={listStyles.actions}>
                      <RowMenu
                        label={`More actions for ${item.title}`}
                        items={[
                          { label: "Open", disabled: !item.file, onSelect: () => openFile(item) },
                          { label: "Download", disabled: !item.file, onSelect: () => download(item) },
                          { label: "Edit", disabled: !canUpload, onSelect: () => open(item) },
                          {
                            label: "Delete",
                            danger: true,
                            disabled: !canDelete,
                            onSelect: () => setDeleting(item),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {shown.length === 0 && (
              <p className={listStyles.empty}>
                {items.length > 0 ? `No ${words.many} match.` : `No ${words.many} uploaded yet.`}
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog
        isOpen={editing !== null}
        isEditing={editing !== null && editing !== "new"}
        form={form}
        onFormChange={(updates: Record<string, unknown>) => setForm((prev) => ({ ...prev, ...updates }))}
        onSubmit={submit}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${words.one}`}
        message={`Delete “${deleting?.title ?? ""}”? Tech Support will no longer offer it.`}
        intent="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) {
            if (kind === "manual") library.deleteManual(deleting.id);
            else library.deleteVideo(deleting.id);
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function fileDetail(item: Item): string {
  if ("file_size" in item) return item.file_size || "";
  return [item.duration, item.resolution].filter(Boolean).join(" · ");
}

function openFile(item: Item) {
  if (item.file) window.open(item.file, "_blank", "noopener");
}

function download(item: Item) {
  const link = document.createElement("a");
  link.href = item.file;
  link.download = item.file_name || item.title;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function matches(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.category, item.description, item.file_name].some((text) =>
    (text ?? "").toLowerCase().includes(q),
  );
}
