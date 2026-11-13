import { useState, Fragment } from "react";
import {
  Search,
  PlusCircle,
  Eye,
  Edit3,
  Printer,
  Trash2,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { EmptyState, TableSkeleton } from "@xpredict/ui";
import type { FeasibilityReport } from "../api/types";
import styles from "./FeasibilityReportsTable.module.css";

interface Props {
  reports: FeasibilityReport[];
  isLoading?: boolean;
  onNewReport: () => void;
  onViewReport: (id: string) => void;
  onEditReport: (id: string) => void;
  onPrintReport: (id: string) => void;
  onDeleteReport: (report: FeasibilityReport) => void;
}

export function FeasibilityReportsTable({
  reports,
  isLoading,
  onNewReport,
  onViewReport,
  onEditReport,
  onPrintReport,
  onDeleteReport,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [metalFilter, setMetalFilter] = useState<"ALL" | "AL" | "FE">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = reports.filter((rep) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      rep.site_name.toLowerCase().includes(q) ||
      rep.project_title.toLowerCase().includes(q) ||
      rep.proposed_model.toLowerCase().includes(q) ||
      rep.site_location.toLowerCase().includes(q) ||
      rep.water_type.toLowerCase().includes(q);

    const matchesMetal = metalFilter === "ALL" || rep.electrode_metal === metalFilter;
    return matchesSearch && matchesMetal;
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Feasibility Proposals</h1>
          <p className={styles.subtitle}>
            Generated wastewater treatment proposals, calculation snapshots, and technical client reports.
          </p>
        </div>

        <div className={styles.headerActions}>
          {reports.length > 0 && (
            <>
              <select
                className={styles.filterSelect}
                value={metalFilter}
                onChange={(e) => setMetalFilter(e.target.value as "ALL" | "AL" | "FE")}
                title="Filter by Electrode Metal"
              >
                <option value="ALL">All Technologies</option>
                <option value="AL">Aluminium (Al)</option>
                <option value="FE">Mild Steel (Fe)</option>
              </select>

              <label className={styles.search}>
                <Search size={15} />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Search site, model, title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </>
          )}

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onNewReport}
          >
            <PlusCircle size={15} />
            <span>New Proposal</span>
          </button>
        </div>
      </header>

      {isLoading && (
        <TableSkeleton label="feasibility proposals" columns={[260, 160, 140, 120, 100, 140]} rows={3} />
      )}

      {!isLoading && reports.length === 0 && (
        <EmptyState
          title="No feasibility proposals yet"
          body="Generate your first technical feasibility study and electrocoagulation reclaimer proposal."
          action={
            <button type="button" className={styles.btnPrimary} onClick={onNewReport}>
              <PlusCircle size={15} />
              <span>Create First Proposal</span>
            </button>
          }
        />
      )}

      {!isLoading && reports.length > 0 && filtered.length === 0 && searchQuery && (
        <EmptyState
          title="No proposals match your search"
          body="Try searching with a different site name, machine model, or technology."
          action={
            <button type="button" className={styles.clearBtn} onClick={() => setSearchQuery("")}>
              Clear search
            </button>
          }
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Proposal &amp; Site</th>
                <th className={styles.th}>Machine Model &amp; Capacity</th>
                <th className={styles.th}>Technology / Metal</th>
                <th className={styles.th}>Water Source</th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Status</th>
                <th className={`${styles.th} ${styles.thRight}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rep) => {
                const isExpanded = expandedId === rep.id;
                return (
                  <Fragment key={rep.id}>
                    <tr
                      className={`${styles.row} ${isExpanded ? styles.rowExpanded : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : rep.id)}
                    >
                  <td className={styles.td}>
                    <div className={styles.projectTitle}>
                      {rep.project_title || "Feasibility Study & Technical Proposal"}
                    </div>
                    <div className={styles.siteInfo}>
                      <MapPin size={11} />
                      <span>{rep.site_name}</span>
                      {rep.site_location && <span>• {rep.site_location}</span>}
                    </div>
                  </td>

                  <td className={styles.td}>
                    <span className={styles.modelBadge}>{rep.proposed_model || "WWT-REC"}</span>
                    <div className={styles.specsSub}>
                      {rep.capacity_kld} KLD · {rep.operating_hours} hrs/day
                    </div>
                  </td>

                  <td className={styles.td}>
                    <div className={styles.metalBadge}>
                      <span
                        className={`${styles.metalDot} ${
                          rep.electrode_metal === "FE" ? styles.metalDotFe : ""
                        }`}
                      />
                      <span>
                        {rep.electrode_metal === "FE" ? "Mild Steel (Fe)" : "Aluminium (Al)"}
                      </span>
                    </div>
                    <div className={styles.specsSub}>{rep.target_dose_mg_l} mg/L dose</div>
                  </td>

                  <td className={styles.td}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-2)" }}>
                      {rep.water_type}
                    </span>
                  </td>

                  <td className={styles.td}>
                    <div className={styles.date}>
                      {formatDate(rep.survey_date || rep.created_at)}
                    </div>
                  </td>

                  <td className={styles.td}>
                    <span
                      className={`${styles.statusBadge} ${
                        rep.status === "FINAL" ? styles.statusFinal : styles.statusDraft
                      }`}
                    >
                      {rep.status || "FINAL"}
                    </span>
                  </td>

                  <td className={`${styles.td} ${styles.tdRight}`}>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewReport(rep.id);
                        }}
                        title="View Document Preview"
                      >
                        <Eye size={15} />
                      </button>

                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditReport(rep.id);
                        }}
                        title="Edit in Proposal Studio"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrintReport(rep.id);
                        }}
                        title="Download / Print PDF"
                      >
                        <Printer size={15} />
                      </button>

                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteReport(rep);
                        }}
                        title="Delete Proposal"
                      >
                        <Trash2 size={15} />
                      </button>

                      <button
                        type="button"
                        className={styles.expandBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : rep.id);
                        }}
                        aria-label="Toggle details"
                        title="Toggle proposal details"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr className={styles.expandedRow}>
                    <td colSpan={7} className={styles.expandedCell}>
                      <div className={styles.expandedContent}>
                        {/* Mobile quick icon-only actions */}
                        <div className={styles.mobileActionsBar}>
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewReport(rep.id);
                            }}
                            title="View Proposal"
                            aria-label="View Proposal"
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditReport(rep.id);
                            }}
                            title="Edit in Proposal Studio"
                            aria-label="Edit in Proposal Studio"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPrintReport(rep.id);
                            }}
                            title="Print / Save PDF"
                            aria-label="Print / Save PDF"
                          >
                            <Printer size={16} />
                          </button>

                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteReport(rep);
                            }}
                            title="Delete Proposal"
                            aria-label="Delete Proposal"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Detailed quick specs summary */}
                        <div className={styles.detailGrid}>
                          <div>
                            <div className={styles.detailSectionTitle}>Engineering Specifications</div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Machine Model:</span>
                              <span className={styles.detailValue}>{rep.proposed_model || "WWT-REC"}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Plant Capacity:</span>
                              <span className={styles.detailValue}>
                                {rep.capacity_kld} KLD ({((Number(rep.capacity_kld) || 15) / (Number(rep.operating_hours) || 18)).toFixed(2)} m³/hr)
                              </span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Daily Operation:</span>
                              <span className={styles.detailValue}>{rep.operating_hours} hrs/day</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Technology:</span>
                              <span className={styles.detailValue}>
                                {rep.electrode_metal === "FE" ? "Mild Steel (Fe)" : "Aluminium (Al)"} Electrocoagulation
                              </span>
                            </div>
                          </div>

                          <div>
                            <div className={styles.detailSectionTitle}>Site &amp; Water Profile</div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Site Name:</span>
                              <span className={styles.detailValue}>{rep.site_name}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Location:</span>
                              <span className={styles.detailValue}>{rep.site_location || "—"}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Water Matrix:</span>
                              <span className={styles.detailValue}>{rep.water_type}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Coagulant Target:</span>
                              <span className={styles.detailValue}>{rep.target_dose_mg_l} mg/L dose @ {rep.supply_voltage || 48}V</span>
                            </div>
                          </div>
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
    </div>
  );
}
