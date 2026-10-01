import React, { useState, useRef, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  User, 
  MapPin, 
  Paperclip, 
  Trash2, 
  Eye, 
  PenTool, 
  ArrowLeft,
  X,
  Download
} from 'lucide-react';

function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  if (width === 0 || height === 0) return true;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10) return false;
  }
  return true;
}

export default function StandaloneClientSign({ reportId, enquiries, setEnquiries, onBackToPortal }) {
  // Find the report across all enquiries
  let foundReport = null;
  let foundSite = null;

  for (const enq of enquiries) {
    const list = enq.siteData?.serviceReports || [];
    const rep = list.find(r => r.id.toString() === reportId.toString());
    if (rep) {
      foundReport = rep;
      foundSite = enq;
      break;
    }
  }

  const [clientName, setClientName] = useState(foundReport?.clientName || '');
  const [signatureData, setSignatureData] = useState('');
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(Boolean(foundReport?.clientSignature));
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Canvas ref
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A';
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  const endDraw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!isCanvasBlank(canvas)) {
      setSignatureData(canvas.toDataURL('image/png'));
      if (error) setError('');
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    setSignatureData('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    const canvas = canvasRef.current;
    if (!hasStroke || isCanvasBlank(canvas) || !signatureData) {
      setError('Signature is mandatory! Please draw your signature in the box.');
      return;
    }

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const fullTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${timeFormatted}`;

    // Update report in enquiries state & localStorage
    setEnquiries(prevEnquiries => {
      return prevEnquiries.map(enq => {
        if (enq.id === foundSite.id) {
          const currentReports = enq.siteData?.serviceReports || [];
          return {
            ...enq,
            siteData: {
              ...enq.siteData,
              serviceReports: currentReports.map(r => {
                if (r.id.toString() === reportId.toString()) {
                  return {
                    ...r,
                    clientName: clientName.trim(),
                    clientSignature: signatureData,
                    status: 'COMPLETED',
                    clientSignedAt: fullTimestamp
                  };
                }
                return r;
              })
            }
          };
        }
        return enq;
      });
    });

    setIsSubmitted(true);
  };

  if (!foundReport) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '1.5rem' }}>
        <div style={{ maxWidth: '480px', width: '100%', background: '#FFFFFF', padding: '2rem', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
            Service Report Not Found
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            The requested link is invalid or the report has been removed.
          </p>
          <button 
            className="btn btn-primary"
            onClick={onBackToPortal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ArrowLeft size={16} /> Go to DMS Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', padding: '2rem 1rem', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: '680px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Top Header Card */}
        <div style={{ background: '#0F172A', color: '#FFFFFF', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 600 }}>
                Xpredict Automation Solutions Pvt Ltd
              </div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.35rem 0 0', color: '#FFFFFF' }}>
                Client Service Sign-Off Portal
              </h1>
            </div>
            <button
              onClick={onBackToPortal}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#E2E8F0',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>

        {/* Success Confirmation Card (if already signed) */}
        {isSubmitted ? (
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '2.5rem 1.5rem', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <CheckCircle2 size={56} color="#10B981" style={{ margin: '0 auto 1rem' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>
              Service Report Signed & Approved!
            </h2>
            <p style={{ color: '#64748B', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
              Thank you, <strong>{clientName || foundReport.clientName}</strong>. Your digital signature has been recorded and the service report has been finalized.
            </p>

            <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', maxWidth: '380px', margin: '0 auto 1.5rem', textAlign: 'left', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.35rem' }}><strong>Site:</strong> {foundSite.customerName}</div>
              <div style={{ marginBottom: '0.35rem' }}><strong>Report Code:</strong> {foundReport.reportCode || `SR-${foundReport.id}`}</div>
              <div style={{ marginBottom: '0.35rem' }}><strong>Date of Service:</strong> {foundReport.date}</div>
              <div><strong>Signed At:</strong> {foundReport.clientSignedAt || 'Just now'}</div>
            </div>

            <button 
              className="btn btn-secondary"
              onClick={onBackToPortal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ArrowLeft size={15} /> Return to DMS Portal
            </button>
          </div>
        ) : (
          /* Report Details & Signing Form */
          <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            
            {/* Report Summary */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Customer / Site</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>{foundSite.customerName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Order Confirmation: {foundSite.ocNumber || 'N/A'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Report Number</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#2563EB' }}>{foundReport.reportCode || `SR-${foundReport.id}`}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Date: {foundReport.date}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div><span style={{ color: '#64748B' }}>Attending Technician:</span> <strong>{foundReport.technician}</strong></div>
                <div><span style={{ color: '#64748B' }}>Service Zone:</span> <strong>{foundReport.zone || 'General'}</strong></div>
              </div>
            </div>

            {/* Service Work Done / Remarks */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                Service Work Done / Observations
              </div>
              <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.88rem', color: '#1E293B', lineHeight: 1.5 }}>
                {foundReport.remarks || foundReport.workDone || 'Routine machine servicing & maintenance completed satisfactorily.'}
              </div>
            </div>

            {/* ATTACHMENTS SECTION - VIEWABLE! */}
            {foundReport.attachments && foundReport.attachments.length > 0 && (
              <div style={{ padding: '1.5rem', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.6rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Paperclip size={15} color="#2563EB" /> Site Attachments & Photos ({foundReport.attachments.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  {foundReport.attachments.map((file, idx) => (
                    <div
                      key={idx}
                      onClick={() => setPreviewAttachment(file)}
                      style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                      title="Click to view full attachment"
                    >
                      {file.dataUrl && file.type === 'IMAGE' ? (
                        <div style={{ height: '80px', overflow: 'hidden', background: '#F1F5F9' }}>
                          <img src={file.dataUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', color: '#64748B' }}>
                          <Paperclip size={28} />
                        </div>
                      )}
                      <div style={{ padding: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#2563EB', paddingBottom: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                        <Eye size={11} /> Click to View
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Technician Sign Verified */}
            {foundReport.servicePersonSignature && (
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', background: '#F0FDF4', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Technician Signature Verified:</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#14532D' }}>
                    {foundReport.servicePersonName || foundReport.technician}
                  </div>
                </div>
                <img 
                  src={foundReport.servicePersonSignature} 
                  alt="Technician Sign" 
                  style={{ height: '42px', maxWidth: '140px', objectFit: 'contain', background: '#FFFFFF', padding: '2px 8px', borderRadius: '4px', border: '1px solid #BBF7D0' }}
                />
              </div>
            )}

            {/* CLIENT SIGNATURE INPUT FORM */}
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.25rem' }}>
                  Client Sign-Off & Approval
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                  Please confirm your name and sign in the box below using your finger, stylus, or mouse.
                </p>
              </div>

              {/* Client Name Input */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Client / Representative Full Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  required
                  type="text"
                  className="form-control"
                  placeholder="Enter your name (e.g. S. Raman, Facility Manager)"
                  value={clientName}
                  onChange={e => {
                    setClientName(e.target.value);
                    if (error) setError('');
                  }}
                />
              </div>

              {/* Canvas Signature Pad */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>
                    Client Digital Signature <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  {hasStroke && (
                    <button
                      type="button"
                      onClick={handleClear}
                      style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      <Trash2 size={12} /> Clear & Re-sign
                    </button>
                  )}
                </div>

                <div 
                  style={{
                    border: error ? '2px solid #EF4444' : hasStroke ? '2px solid #10B981' : '2px dashed #94A3B8',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    position: 'relative',
                    overflow: 'hidden',
                    touchAction: 'none'
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={150}
                    style={{
                      width: '100%',
                      height: '150px',
                      display: 'block',
                      cursor: 'crosshair',
                      touchAction: 'none'
                    }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />

                  {!hasStroke && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#94A3B8',
                        fontSize: '0.88rem',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        userSelect: 'none'
                      }}
                    >
                      <PenTool size={16} /> Sign here with finger, touch, or mouse
                    </div>
                  )}
                </div>

                {error && (
                  <div style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  background: '#10B981',
                  borderColor: '#10B981',
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <CheckCircle2 size={18} /> Confirm & Submit Signature
              </button>

            </form>

          </div>
        )}

      </div>

      {/* ATTACHMENT ZOOM / PREVIEW MODAL */}
      {previewAttachment && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setPreviewAttachment(null)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '650px', width: '90%', padding: '1.25rem', background: '#FFFFFF', borderRadius: '12px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                {previewAttachment.name}
              </div>
              <button 
                type="button" 
                onClick={() => setPreviewAttachment(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            {previewAttachment.dataUrl && previewAttachment.type === 'IMAGE' ? (
              <div style={{ textAlign: 'center' }}>
                <img 
                  src={previewAttachment.dataUrl} 
                  alt={previewAttachment.name} 
                  style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '6px' }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', background: '#F8FAFC', borderRadius: '8px' }}>
                <Paperclip size={48} color="#2563EB" style={{ margin: '0 auto 1rem' }} />
                <div style={{ fontWeight: 600 }}>{previewAttachment.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>{previewAttachment.size}</div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
