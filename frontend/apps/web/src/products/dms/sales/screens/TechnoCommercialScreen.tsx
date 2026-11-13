/**
 * Sales → Techno-Commercial screen.
 *
 * Clean, mobile-responsive hub to upload, view, edit, or delete techno-commercial documents.
 */

import { useState, Fragment } from "react";
import { EmptyState, TableSkeleton, ConfirmDialog, ErrorState } from "@xpredict/ui";
import { asProblem } from "@xpredict/api-client";

import {
  useTechnoCommercialDocuments,
  useUploadTechnoCommercialDocument,
  useUpdateTechnoCommercialDocument,
  useDeleteTechnoCommercialDocument,
} from "../hooks/useTechnoCommercial";
import type { TechnoCommercialDocument } from "../api/technoCommercial";
import { TechnoCommercialDialog } from "../components/TechnoCommercialDialog";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./TechnoCommercialScreen.module.css";

// Software's standard design icons
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function TechnoCommercialScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<TechnoCommercialDocument | null>(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const {
    data: documents = [],
    isPending,
    isError,
    error,
    refetch,
  } = useTechnoCommercialDocuments({
    search: searchQuery.trim() || undefined,
  });

  const uploadMutation = useUploadTechnoCommercialDocument();
  const updateMutation = useUpdateTechnoCommercialDocument();
  const deleteMutation = useDeleteTechnoCommercialDocument();

  const { canCreateQuote, canEditQuote, isManagerOrAdmin } = useDmsPermissions();

  const handleOpenUpload = () => {
    setEditingDoc(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (doc: TechnoCommercialDocument) => {
    setEditingDoc(doc);
    setDialogOpen(true);
  };

  const handleFormSubmit = async (formData: FormData) => {
    try {
      if (editingDoc) {
        await updateMutation.mutateAsync({
          documentId: editingDoc.id,
          formData,
        });
      } else {
        await uploadMutation.mutateAsync(formData);
      }
      setDialogOpen(false);
      setEditingDoc(null);
    } catch {
      // Handled by mutation error state
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmState) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirmState.id);
      setDeleteConfirmState(null);
    } catch {
      // Handled by mutation error state
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Techno-Commercial</h1>
          <p className={styles.subtitle}>
            Upload, view, edit, or delete techno-commercial documents.
          </p>
        </div>

        <div className={styles.headerActions}>
          <label className={styles.search}>
            <SearchIcon />
            <span className={styles.srOnly}>Search documents</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search title, site, quote #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          {canCreateQuote && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleOpenUpload}
            >
              + Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      {isPending ? (
        <TableSkeleton label="techno-commercial documents" columns={[240, 180, 160, 120, "grow"]} rows={3} />
      ) : isError ? (
        <ErrorState
          title="Could not load techno-commercial documents"
          code={asProblem(error).code}
          traceId={asProblem(error).trace_id}
          onRetry={() => void refetch()}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          title="No techno-commercial documents"
          body={
            searchQuery
              ? "No documents match your search."
              : "Upload your techno-commercial document to view, edit, or download it anytime."
          }
          action={
            canCreateQuote ? (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleOpenUpload}
              >
                + Upload Document
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Document Name</th>
                <th className={styles.th}>Site / Customer</th>
                <th className={styles.th}>File</th>
                <th className={`${styles.th} ${styles.hideOnMobile}`}>Upload Date</th>
                <th className={`${styles.th} ${styles.thRight}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const isExpanded = expandedId === doc.id;
                const formattedDate = new Date(doc.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });

                return (
                  <Fragment key={doc.id}>
                    <tr
                      className={`${styles.row} ${isExpanded ? styles.rowExpanded : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                    >
                      <td className={styles.td}>
                        <div className={styles.docTitle}>{doc.title}</div>
                        {doc.notes && <div className={styles.docNotes}>{doc.notes}</div>}
                      </td>

                      <td className={styles.td}>
                        {doc.site_name ? (
                          <div>
                            <div className={styles.siteBadge}>
                              <span>📍</span>
                              <strong>{doc.site_name}</strong>
                            </div>
                            {doc.quote_number && (
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-3)", marginTop: "2px" }}>
                                Quote: {doc.quote_number}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-text-3)", fontSize: "var(--text-xs)" }}>— General —</span>
                        )}
                      </td>

                      <td className={styles.td}>
                        <span className={styles.fileName}>{doc.file_name}</span>
                      </td>

                      <td className={`${styles.td} ${styles.hideOnMobile}`}>
                        <span className={styles.fileDate}>{formattedDate}</span>
                      </td>

                      <td className={`${styles.td} ${styles.tdRight}`}>
                        <div className={styles.actions}>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.iconBtn}
                              title="View Document"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <EyeIcon />
                            </a>
                          )}

                          {canEditQuote && (
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(doc);
                              }}
                              title="Edit Document"
                            >
                              <PencilIcon />
                            </button>
                          )}

                          {isManagerOrAdmin && (
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmState({
                                  id: doc.id,
                                  title: doc.title,
                                });
                              }}
                              title="Delete Document"
                            >
                              <TrashIcon />
                            </button>
                          )}

                          <button
                            type="button"
                            className={styles.expandBtn}
                            aria-label="Toggle details"
                          >
                            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Mobile Expanded Details & Actions */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className={styles.expandedCell}>
                          <div className={styles.expandedContent}>
                            <div className={styles.mobileActionsBar}>
                              {doc.file_url && (
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.iconBtn}
                                  title="View Document"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <EyeIcon />
                                </a>
                              )}

                              {canEditQuote && (
                                <button
                                  type="button"
                                  className={styles.iconBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEdit(doc);
                                  }}
                                  title="Edit Document"
                                >
                                  <PencilIcon />
                                </button>
                              )}

                              {isManagerOrAdmin && (
                                <button
                                  type="button"
                                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmState({
                                      id: doc.id,
                                      title: doc.title,
                                    });
                                  }}
                                  title="Delete Document"
                                >
                                  <TrashIcon />
                                </button>
                              )}
                            </div>

                            <div className={styles.detailGrid}>
                              {doc.site_name && (
                                <div className={styles.infoRow}>
                                  <strong>Site / Customer:</strong> {doc.site_name}
                                </div>
                              )}
                              {doc.quote_number && (
                                <div className={styles.infoRow}>
                                  <strong>Quote Reference:</strong> {doc.quote_number}
                                </div>
                              )}
                              <div className={styles.infoRow}>
                                <strong>File:</strong> {doc.file_name}
                              </div>
                              <div className={styles.infoRow}>
                                <strong>Uploaded on:</strong> {formattedDate}
                              </div>
                              {doc.notes && (
                                <div className={styles.infoRow}>
                                  <strong>Notes:</strong> {doc.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload & Edit Dialog */}
      <TechnoCommercialDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingDoc(null);
        }}
        onSubmit={handleFormSubmit}
        isPending={uploadMutation.isPending || updateMutation.isPending}
        initialData={editingDoc}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={deleteConfirmState !== null}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteConfirmState?.title || ""}"?`}
        confirmLabel="Delete"
        intent="danger"
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        onCancel={() => setDeleteConfirmState(null)}
      />
    </div>
  );
}
