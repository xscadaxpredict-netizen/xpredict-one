import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SignaturePad } from "../components/SignaturePad";
import { useDialog } from "../../shared/hooks/useDialog";
import styles from "./PublicReportSignScreen.module.css";
import { Loading } from "../../../../shell/components/Loading";

export default function PublicReportSignScreen() {
  const { showAlert, DialogComponent } = useDialog();
  const { orgSlug, token } = useParams<{ orgSlug: string; token: string }>();
  
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [clientName, setClientName] = useState("");
  const [signatureData, setSignatureData] = useState("");

  useEffect(() => {
    fetch(`/api/v1/orgs/${orgSlug}/dms/site-services/public/report/${token}/`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (data.already_signed) {
            setAlreadySigned(true);
          } else {
            setError(data.detail || "Failed to load report");
          }
        } else {
          setReport(data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [orgSlug, token]);

  const handleSave = async () => {
    if (!signatureData) {
      showAlert("Error", "Please provide a signature before saving.");
      return;
    }
    if (!clientName.trim()) {
      showAlert("Error", "Please enter your name.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/dms/site-services/public/report/${token}/sign/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signatureData, client_name: clientName }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "Failed to save signature");
      }
      
      setAlreadySigned(true);
    } catch (err: any) {
      showAlert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (alreadySigned) {
    return (
      <div className={styles.center}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <h2>Report Signed</h2>
          <p>This service report has already been signed and finalized. Thank you!</p>
        </div>
      </div>
    );
  }
  if (error) return <div className={styles.center}>Error: {error}</div>;
  if (!report) return <div className={styles.center}>Report not found.</div>;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2>Service Report Verification</h2>
          <p>Please review the details below and provide your signature to approve the service work.</p>
        </div>
        
        <div className={styles.detailsBlock}>
          <div className={styles.detailRow}>
            <span>Report ID:</span>
            <strong>{report.report_code || "N/A"}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Service Date:</span>
            <strong>{report.service_date}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Technician:</span>
            <strong>{report.technician_display_name || report.service_person_name}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Remarks:</span>
            <strong>{report.remarks || "No remarks"}</strong>
          </div>
        </div>

        {report.attachments && report.attachments.length > 0 && (
          <div className={styles.attachmentsSection}>
            <h3>Service Images & Documents</h3>
            <div className={styles.imageGrid}>
              {report.attachments.map((att: any) => {
                const isPdf = att.file_name?.toLowerCase().endsWith('.pdf') || att.file_type === 'application/pdf';
                return (
                  <div key={att.id} className={styles.imageCard}>
                    {isPdf ? (
                      <a href={att.file} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textDecoration: 'none', color: '#475569', height: '100%', background: '#f8fafc' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        <span style={{ marginTop: '10px', fontSize: '0.85rem', wordBreak: 'break-all', textAlign: 'center', fontWeight: 500 }}>{att.file_name}</span>
                      </a>
                    ) : (
                      <img src={att.file} alt={att.file_name} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.signatureSection}>
          <h3>Client Signature</h3>
          
          <label className={styles.label}>Signatory Name</label>
          <input 
            type="text" 
            className={styles.input} 
            placeholder="Enter your full name" 
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />

          <label className={styles.label}>Signature</label>
          <div className={styles.sigContainer}>
            <SignaturePad 
              label=""
              value={signatureData}
              onChange={(val: string) => setSignatureData(val)}
              placeholder="Sign your name here"
            />
          </div>
          <div className={styles.sigActions}>
            <button className={styles.btnSecondary} onClick={() => setSignatureData("")} disabled={saving}>Clear</button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Approve & Save"}
            </button>
          </div>
        </div>
      </div>
      <DialogComponent />
    </div>
  );
}
