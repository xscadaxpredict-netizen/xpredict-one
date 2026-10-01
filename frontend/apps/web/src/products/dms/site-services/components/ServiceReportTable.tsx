import { ClockIcon, MapPinIcon, CalendarIcon, UserIcon, CheckIcon, PaperclipIcon, EyeIcon, CheckCircleIcon, AlertCircleIcon, LinkIcon, Edit3Icon, Trash2Icon, FileTextIcon } from "lucide-react";
import styles from "./ServiceReportTable.module.css";

interface Props {
  reports: any[];
  onView: (report: any) => void;
  onEdit: (report: any) => void;
  onDelete: (id: string) => void;
}

export function ServiceReportTable({ reports, onView, onEdit, onDelete }: Props) {
  if (reports.length === 0) {
    return (
      <div className={styles.emptyState}>
        <FileTextIcon size={36} className={styles.emptyIcon} />
        <div>No Service Reports Found</div>
        <div className={styles.muted}>Click "New Report" to record a site visit.</div>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Report ID & Time</th>
            <th className={styles.th}>Site & Zone</th>
            <th className={styles.th}>Service Date & Tech</th>
            <th className={styles.th}>Remarks & Attachments</th>
            <th className={styles.th}>Client Sign Status</th>
            <th className={styles.thRight}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className={styles.row}>
              <td className={styles.td}>
                <div className={styles.bold} style={{ fontSize: "0.88rem" }}>{report.report_code || "SR-NEW"}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--color-text-2)', background: 'var(--color-surface-alt)', padding: '0.15rem 0.45rem', borderRadius: '4px', marginTop: '0.3rem' }}>
                  <ClockIcon size={11} /> {report.uploadedAt || 'Recently'}
                </div>
              </td>
              <td className={styles.td}>
                <div className={styles.bold}>{report.siteName}</div>
                <div className={styles.muted} style={{ fontSize: "0.75rem" }}>OC: {report.ocNumber || "N/A"}</div>
                {report.zone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '999px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #DBEAFE' }}>
                    <MapPinIcon size={10} /> {report.zone}
                  </span>
                )}
              </td>
              <td className={styles.td}>
                <div className={styles.bold} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CalendarIcon size={13} color="var(--color-primary)" /> {report.date}
                </div>
                <div className={styles.muted} style={{ fontSize: '0.78rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserIcon size={12} /> {report.technician}
                </div>
                <span style={{ fontSize: '0.7rem', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}>
                  <CheckIcon size={10} /> Tech Signed
                </span>
              </td>
              <td className={styles.td} style={{ maxWidth: '240px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {report.remarks}
                </div>
                <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '999px', padding: '0.15rem 0.55rem', fontSize: '0.72rem', color: '#1D4ED8', fontWeight: 600, cursor: 'pointer' }}>
                  <PaperclipIcon size={11} /> 1 file <EyeIcon size={10} style={{ marginLeft: '0.15rem' }} />
                </button>
              </td>
              <td className={styles.td}>
                {report.status === "COMPLETED" ? (
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                      <CheckCircleIcon size={12} /> Signed by Client
                    </span>
                  </div>
                ) : (
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
                      <AlertCircleIcon size={11} /> Awaiting Client Sign
                    </span>
                    <button type="button" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', marginTop: '0.35rem', color: '#D97706', borderColor: '#FDE68A', background: '#FFFBEB', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, borderRadius: 'var(--radius-sm)', border: '1px solid #FDE68A', cursor: 'pointer' }}>
                      <LinkIcon size={12} /> Client Signature Link
                    </button>
                  </div>
                )}
              </td>
              <td className={styles.tdRight}>
                <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                  <button type="button" className={styles.iconBtn} title="View Report" onClick={() => onView(report)}>
                    <EyeIcon size={16} />
                  </button>
                  <button type="button" className={styles.iconBtn} title="Edit Report" style={{ color: "var(--color-primary)" }} onClick={() => onEdit(report)}>
                    <Edit3Icon size={16} />
                  </button>
                  <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete Report" onClick={() => onDelete(report.id)}>
                    <Trash2Icon size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
