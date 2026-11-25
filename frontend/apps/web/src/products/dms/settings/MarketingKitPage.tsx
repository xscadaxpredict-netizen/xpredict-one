/**
 * DMS settings -> Masters -> MARKETING KIT, in the shared list format (C78):
 * brochures, demo videos and banners in one table, a filter for the kind, a ⋮
 * per row. Tools -> Marketing Kit is where dealers read them.
 *
 * Was a tab of "Load Master Data" (moved and restyled 2026-11-25). The upload
 * dialog is Tools' own, unchanged.
 *
 * EDIT IS GREYED, AND THAT IS NOT NEW: the endpoint has no update, so the old
 * screen's Edit opened the dialog, then saved nothing (`updateMaterial` only
 * logs a warning). Greyed with the reason rather than a button that lies.
 */

import { useState } from "react";
import {
  ConfirmDialog,
  ListFilter,
  RowMenu,
  TableSkeleton,
  listPageStyles as listStyles,
} from "@xpredict/ui";

import { usePageSearch } from "../../../stores/pageSearchStore";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import type { MaterialType } from "../tools/api/types";
import { UploadMaterialDialog } from "../tools/components/UploadMaterialDialog";
import { useMarketingKit } from "../tools/hooks/useMarketingKit";
import { PlusIcon } from "./icons";
import styles from "./Masters.module.css";

interface Material {
  id: string;
  type: MaterialType;
  title: string;
  description: string;
  fileName: string;
  detail: string;
  file?: string;
}

type Filter = "all" | MaterialType;

const FILTERS = [
  { value: "all", label: "All materials" },
  { value: "brochure", label: "Brochures & catalogs" },
  { value: "video", label: "Demo videos" },
  { value: "ad", label: "Banners & ads" },
] as const;

const TYPE_LABEL: Record<MaterialType, string> = {
  brochure: "Brochure",
  video: "Demo video",
  ad: "Banner / ad",
};

/* The three lists have different shapes; the table needs one. */
function toMaterials(type: MaterialType, items: readonly Record<string, unknown>[]): Material[] {
  return items.map((item) => {
    const text = (key: string) => {
      const value = item[key];
      return typeof value === "string" ? value : "";
    };
    const detail =
      type === "brochure"
        ? [text("category"), text("fileSize") || text("file_size")]
        : type === "video"
          ? [text("duration"), text("resolution")]
          : [text("format"), text("fileSize") || text("file_size")];
    return {
      id: text("id"),
      type,
      title: text("title"),
      description: text("description"),
      fileName: text("fileName") || text("file_name"),
      detail: detail.filter(Boolean).join(" · "),
      file: text("file") || undefined,
    };
  });
}

export function MarketingKitPage() {
  const kit = useMarketingKit();
  const { canManageMarketing } = useDmsPermissions();
  const query = usePageSearch((state) => state.query);
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<MaterialType>("brochure");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [deleting, setDeleting] = useState<Material | null>(null);

  const all = [
    ...toMaterials("brochure", kit.brochures as never),
    ...toMaterials("video", kit.videos as never),
    ...toMaterials("ad", kit.ads as never),
  ];
  const shown = all.filter((item) => (filter === "all" || item.type === filter) && matches(item, query));

  const startUpload = () => {
    setUploadType(filter === "all" ? "brochure" : filter);
    setForm({});
    setUploading(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) {
      if (key !== "file" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        data.append(key, String(value));
      }
    }
    data.append("material_type", uploadType.toUpperCase());
    const chosen = (form.file as FileList | undefined)?.[0];
    if (!chosen) {
      window.alert("Please select a file to upload.");
      return;
    }
    data.append("file", chosen);
    kit.addMaterial(uploadType, data);
    setUploading(false);
  };

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Marketing Kit</h1>
      </div>

      <div className={listStyles.toolbar}>
        <ListFilter id="marketing-filter" value={filter} options={FILTERS} onChange={setFilter} />
        {!kit.isPending && (
          <span className={listStyles.count} aria-live="polite">
            {shown.length === 1 ? "1 material" : `${String(shown.length)} materials`}
          </span>
        )}
        <span className={listStyles.spacer} />
        <button
          type="button"
          className={listStyles.primaryButton}
          aria-disabled={canManageMarketing ? undefined : "true"}
          title={canManageMarketing ? undefined : "You do not have permission to upload marketing material"}
          onClick={() => canManageMarketing && startUpload()}
        >
          <PlusIcon />
          Upload Material
        </button>
      </div>

      <div className={listStyles.listArea}>
        {kit.isPending ? (
          <TableSkeleton label="marketing material" columns={[280, 140, 220, 56]} rows={4} />
        ) : (
          <div className={listStyles.tableWrap}>
            <table className={listStyles.table}>
              <caption className={listStyles.visuallyHidden}>
                Marketing material dealers can download from Tools.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Kind</th>
                  <th scope="col">File</th>
                  <th scope="col" className={listStyles.actions}>
                    <span className={listStyles.visuallyHidden}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={`${item.type}-${item.id}`}>
                    <th scope="row">
                      <div className={listStyles.stack}>
                        <span className={listStyles.primary}>{item.title}</span>
                        {item.description && <span className={listStyles.sub}>{item.description}</span>}
                      </div>
                    </th>
                    <td>{TYPE_LABEL[item.type]}</td>
                    <td>
                      <div className={listStyles.stack}>
                        <span>{item.fileName || <span className={listStyles.none}>—</span>}</span>
                        <span className={`${listStyles.sub} ${styles.muted}`}>{item.detail}</span>
                      </div>
                    </td>
                    <td className={listStyles.actions}>
                      <RowMenu
                        label={`More actions for ${item.title}`}
                        items={[
                          { label: "Open", disabled: !item.file, onSelect: () => openFile(item) },
                          { label: "Download", disabled: !item.file, onSelect: () => download(item) },
                          { label: "Edit", disabled: true },
                          {
                            label: "Delete",
                            danger: true,
                            disabled: !canManageMarketing,
                            onSelect: () => setDeleting(item),
                          },
                        ]}
                        note="Editing is not built yet: delete and upload again."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {shown.length === 0 && (
              <p className={listStyles.empty}>
                {all.length > 0 ? "No materials match." : "No marketing material uploaded yet."}
              </p>
            )}
          </div>
        )}
      </div>

      <UploadMaterialDialog
        isOpen={uploading}
        isEditing={false}
        type={uploadType}
        form={form}
        onFormChange={(updates: Record<string, unknown>) => setForm((prev) => ({ ...prev, ...updates }))}
        onTypeChange={setUploadType}
        onSubmit={submit}
        onClose={() => setUploading(false)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete material"
        message={`Delete “${deleting?.title ?? ""}”? Dealers will no longer find it in Tools.`}
        intent="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) kit.deleteMaterial(deleting.type, deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function openFile(item: Material) {
  if (item.file) window.open(item.file, "_blank", "noopener");
}

function download(item: Material) {
  if (!item.file) return;
  const link = document.createElement("a");
  link.href = item.file;
  link.download = item.fileName || item.title;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function matches(item: Material, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.description, item.fileName].some((text) => text.toLowerCase().includes(q));
}
