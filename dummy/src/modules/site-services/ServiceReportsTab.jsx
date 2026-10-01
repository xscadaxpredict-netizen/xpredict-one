import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  Paperclip, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  Eye, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  X, 
  Share2, 
  Trash2, 
  ExternalLink,
  PenTool,
  Printer,
  ChevronRight,
  Send,
  Download
} from 'lucide-react';

// Foolproof canvas emptiness validator (checks pixel alpha/color)
function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  if (width === 0 || height === 0) return true;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10) return false; // Found drawn stroke
  }
  return true;
}

// Clean Canvas Signature Pad
function SignaturePad({ label, value, onChange, isRequired = true, error, placeholder = "Draw signature here" }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A';

    if (value && typeof value === 'string' && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasStroke(true);
      };
      img.src = value;
    } else if (!value) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStroke(false);
    }
  }, [value]);

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
      onChange(canvas.toDataURL('image/png'));
    } else {
      onChange('');
    }
  };

  const handleClear = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label className="form-label" style={{ fontWeight: 600, marginBottom: 0, fontSize: '0.85rem' }}>
          {label} {isRequired && <span style={{ color: '#EF4444' }}>*</span>}
        </label>
        {hasStroke && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#EF4444',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem'
            }}
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      <div 
        style={{
          border: error ? '2px solid #EF4444' : hasStroke ? '1.5px solid #10B981' : '1.5px dashed #CBD5E1',
          borderRadius: 'var(--radius-sm)',
          background: '#FFFFFF',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
          touchAction: 'none'
        }}
      >
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          style={{
            width: '100%',
            height: '120px',
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
              fontSize: '0.82rem',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              userSelect: 'none'
            }}
          >
            <PenTool size={14} /> {placeholder}
          </div>
        )}
      </div>

      {error ? (
        <div style={{ color: '#EF4444', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <AlertCircle size={12} /> {error}
        </div>
      ) : hasStroke ? (
        <div style={{ color: '#10B981', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Check size={12} /> Signature captured
        </div>
      ) : null}
    </div>
  );
}

export default function ServiceReportsTab({ sites = [], addReport, updateReport }) {
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [selectedReportForAttachments, setSelectedReportForAttachments] = useState(null);
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  // Form Fields State
  const [formData, setFormData] = useState({
    siteId: '',
    zonePincode: '',
    date: new Date().toISOString().split('T')[0],
    technician: '',
    zone: 'South Zone',
    customZone: '',
    remarks: '',
    attachments: [],
    servicePersonName: '',
    servicePersonSignature: '',
    clientName: '',
    clientSignature: ''
  });

  const [formErrors, setFormErrors] = useState({});

  // Flatten reports from confirmed sites
  const displaySites = selectedSiteId ? sites.filter(s => s.id.toString() === selectedSiteId) : sites;
  const allReports = displaySites.flatMap(s => 
    (s.siteData?.serviceReports || []).map(r => ({
      ...r,
      siteId: s.id,
      siteName: s.customerName,
      ocNumber: s.ocNumber
    }))
  );

  // Filtered reports
  const filteredReports = allReports.filter(r => {
    const matchesSearch = 
      (r.siteName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.technician || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.zone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.reportCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.remarks || r.workDone || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'SIGNED') return matchesSearch && (r.status === 'COMPLETED' || Boolean(r.clientSignature));
    if (statusFilter === 'PENDING') return matchesSearch && (!r.clientSignature || r.status === 'AWAITING_CLIENT_SIGN');
    return matchesSearch;
  });

  // Open Form for New Report
  const handleOpenNewReport = () => {
    setEditingReport(null);
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0];
    
    setFormData({
      siteId: selectedSiteId || (sites[0]?.id ? sites[0].id.toString() : ''),
      zonePincode: '',
      date: formattedDate,
      technician: '',
      zone: 'South Zone',
      customZone: '',
      remarks: '',
      attachments: [],
      servicePersonName: '',
      servicePersonSignature: '',
      clientName: '',
      clientSignature: ''
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Form for Editing Existing Report
  const handleOpenEditReport = (report) => {
    setEditingReport(report);
    const standardZones = ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central Zone'];
    const isStandardZone = standardZones.includes(report.zone);

    setFormData({
      siteId: report.siteId ? report.siteId.toString() : '',
      date: report.date || '',
      technician: report.technician || '',
      zone: isStandardZone ? report.zone : 'Other',
      customZone: isStandardZone ? '' : report.zone || '',
      remarks: report.remarks || report.workDone || '',
      attachments: report.attachments || [],
      servicePersonName: report.servicePersonName || report.technician || '',
      servicePersonSignature: report.servicePersonSignature || '',
      clientName: report.clientName || '',
      clientSignature: report.clientSignature || ''
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Handle Attachment Upload (stores base64 dataUrl so it is viewable across tabs and reloads)
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({
          ...prev,
          attachments: [
            ...prev.attachments,
            {
              name: file.name,
              size: (file.size / 1024).toFixed(1) + ' KB',
              type: file.type.startsWith('image/') ? 'IMAGE' : 'DOC',
              dataUrl: event.target.result
            }
          ]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  // Save Service Report
  const handleSaveReport = (e) => {
    e.preventDefault();
    const errors = {};

    if (!formData.siteId) errors.siteId = 'Please select a site.';
    if (!formData.date) errors.date = 'Date of service is required.';
    if (!formData.technician.trim()) errors.technician = 'Technician name is required.';
    if (formData.zone === 'Other' && !formData.customZone.trim()) errors.zone = 'Please enter zone name.';
    if (!formData.remarks.trim()) errors.remarks = 'Service remarks/work done is required.';
    if (!formData.servicePersonName.trim()) errors.servicePersonName = 'Service person name is required.';
    if (!formData.servicePersonSignature) errors.servicePersonSignature = 'Service person signature is mandatory.';

    if (!formData.clientName.trim()) {
      errors.clientName = 'Client name is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const fullTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${timeFormatted}`;

    const finalZone = formData.zone === 'Other' ? formData.customZone.trim() : formData.zone;
    const isClientSigned = Boolean(formData.clientSignature);

    const reportPayload = {
      id: editingReport ? editingReport.id : Date.now(),
      reportCode: editingReport?.reportCode || `SR-${Math.floor(10000 + Math.random() * 90000)}`,
      date: formData.date,
      technician: formData.technician.trim(),
      zone: finalZone,
      remarks: formData.remarks.trim(),
      workDone: formData.remarks.trim(),
      attachments: formData.attachments,
      servicePersonName: formData.servicePersonName.trim(),
      servicePersonSignature: formData.servicePersonSignature,
      clientName: formData.clientName.trim(),
      clientSignature: formData.clientSignature || null,
      status: isClientSigned ? 'COMPLETED' : 'AWAITING_CLIENT_SIGN',
      uploadedAt: editingReport?.uploadedAt || fullTimestamp,
      lastModifiedAt: fullTimestamp,
      uploadedTimeOnly: editingReport?.uploadedTimeOnly || timeFormatted,
      clientSignedAt: isClientSigned ? (editingReport?.clientSignedAt || fullTimestamp) : null
    };

    const targetSiteId = parseInt(formData.siteId);

    if (editingReport) {
      if (updateReport) {
        updateReport(editingReport.siteId, targetSiteId, 'serviceReports', editingReport.id, reportPayload);
      } else {
        addReport(targetSiteId, 'serviceReports', reportPayload);
      }
    } else {
      addReport(targetSiteId, 'serviceReports', reportPayload);
    }

    setIsFormModalOpen(false);
    setEditingReport(null);
  };

  // Get shareable client signature URL
  const getClientSignUrl = (report) => {
    return `${window.location.origin}/#sign-${report.id}`;
  };

  const handleCopyLink = (report) => {
    const url = getClientSignUrl(report);
    navigator.clipboard.writeText(url);
    setCopiedLinkId(report.id);
    setTimeout(() => setCopiedLinkId(null), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* TOP CONTROLS BAR */}
      <div 
        style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '1rem',
          background: 'var(--bg-surface)',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
          {/* Site Filter */}
          <select 
            className="form-control" 
            style={{ maxWidth: '260px' }} 
            value={selectedSiteId} 
            onChange={e => setSelectedSiteId(e.target.value)}
          >
            <option value="">All Deployed Sites ({sites.length})</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>
                {s.customerName} ({s.ocNumber || 'No OC'})
              </option>
            ))}
          </select>

          {/* Search Box */}
          <input
            type="text"
            className="form-control"
            placeholder="Search report, tech, zone..."
            style={{ maxWidth: '260px' }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          {/* Status Filter */}
          <select
            className="form-control"
            style={{ maxWidth: '190px' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Status ({allReports.length})</option>
            <option value="SIGNED">Signed & Completed</option>
            <option value="PENDING">Awaiting Client Sign</option>
          </select>
        </div>

        {/* New Report Button */}
        <button 
          className="btn btn-primary"
          onClick={handleOpenNewReport}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
        >
          <Plus size={16} /> New Service Report
        </button>
      </div>

      {/* SERVICE REPORTS TABLE */}
      <div className="table-container" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: '150px' }}>Report ID & Time</th>
              <th style={{ minWidth: '180px' }}>Site & Zone</th>
              <th style={{ minWidth: '160px' }}>Service Date & Tech</th>
              <th style={{ minWidth: '220px' }}>Remarks & Attachments</th>
              <th style={{ minWidth: '170px' }}>Client Sign Status</th>
              <th style={{ minWidth: '160px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  <FileText size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>No Service Reports Found</div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                    Click <strong>"+ New Service Report"</strong> to record a site visit, remarks, technician and client signatures.
                  </div>
                </td>
              </tr>
            ) : (
              filteredReports.map(report => {
                const isSigned = report.status === 'COMPLETED' || Boolean(report.clientSignature);

                return (
                  <tr key={report.id}>
                    
                    {/* Report ID & Upload Time */}
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                        {report.reportCode || `SR-${report.id.toString().slice(-5)}`}
                      </div>
                      <div 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '0.3rem', 
                          fontSize: '0.72rem', 
                          color: '#475569',
                          background: 'var(--bg-surface-alt)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          marginTop: '0.3rem'
                        }}
                      >
                        <Clock size={11} /> {report.uploadedAt || 'Uploaded recently'}
                      </div>
                    </td>

                    {/* Site & Zone */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {report.siteName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        OC: {report.ocNumber || 'N/A'}
                      </div>
                      {report.zone && (
                        <span 
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            marginTop: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.1rem 0.45rem',
                            borderRadius: '999px',
                            background: '#EFF6FF',
                            color: '#2563EB',
                            border: '1px solid #DBEAFE'
                          }}
                        >
                          <MapPin size={10} /> {report.zone}
                        </span>
                      )}
                    </td>

                    {/* Service Date & Technician */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={13} color="var(--accent-color)" /> {report.date}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <User size={12} /> {report.technician}
                      </div>
                      {report.servicePersonSignature && (
                        <span style={{ fontSize: '0.7rem', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}>
                          <Check size={10} /> Tech Signed
                        </span>
                      )}
                    </td>

                    {/* Remarks & Attachments (Clean, Simple, Uncluttered) */}
                    <td style={{ maxWidth: '240px' }}>
                      <div 
                        style={{ 
                          fontSize: '0.82rem', 
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={report.remarks || report.workDone || ''}
                      >
                        {report.remarks || report.workDone || 'Routine maintenance'}
                      </div>

                      {/* Clean compact attachments pill badge */}
                      {report.attachments && report.attachments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (report.attachments.length === 1) {
                              setPreviewAttachment(report.attachments[0]);
                            } else {
                              setSelectedReportForAttachments(report);
                            }
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            marginTop: '0.35rem',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '999px',
                            padding: '0.15rem 0.55rem',
                            fontSize: '0.72rem',
                            color: '#1D4ED8',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          title="Click to view attachments"
                        >
                          <Paperclip size={11} />
                          {report.attachments.length} {report.attachments.length === 1 ? 'file' : 'files'}
                          <Eye size={10} style={{ marginLeft: '0.15rem' }} />
                        </button>
                      )}
                    </td>

                    {/* Client Sign Status & Sign Link */}
                    <td>
                      {isSigned ? (
                        <div>
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.3rem', 
                              padding: '0.2rem 0.55rem', 
                              borderRadius: '999px', 
                              fontSize: '0.75rem', 
                              fontWeight: 700,
                              background: '#F0FDF4',
                              color: '#16A34A',
                              border: '1px solid #BBF7D0'
                            }}
                          >
                            <CheckCircle2 size={12} /> Signed by Client
                          </span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            {report.clientName}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.3rem', 
                              padding: '0.2rem 0.55rem', 
                              borderRadius: '999px', 
                              fontSize: '0.72rem', 
                              fontWeight: 700,
                              background: '#FEF3C7',
                              color: '#D97706',
                              border: '1px solid #FDE68A'
                            }}
                          >
                            <AlertCircle size={11} /> Awaiting Client Sign
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => handleCopyLink(report)}
                            className="btn btn-secondary btn-small"
                            style={{ 
                              padding: '0.25rem 0.6rem', 
                              fontSize: '0.72rem', 
                              marginTop: '0.35rem', 
                              color: '#D97706', 
                              borderColor: '#FDE68A', 
                              background: '#FFFBEB',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontWeight: 600
                            }}
                            title="Copy Client Signature Link"
                          >
                            {copiedLinkId === report.id ? <Check size={12} color="#10B981" /> : <LinkIcon size={12} />}
                            {copiedLinkId === report.id ? 'Link Copied!' : 'Client Signature Link'}
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        {/* View Report */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          style={{ padding: '0.3rem 0.55rem' }}
                          title="View Full Report"
                          onClick={() => setViewingReport(report)}
                        >
                          <Eye size={14} />
                        </button>

                        {/* Edit Report */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          style={{ padding: '0.3rem 0.55rem', color: 'var(--accent-color)' }}
                          title="Edit Service Report"
                          onClick={() => handleOpenEditReport(report)}
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CREATE / EDIT SERVICE REPORT MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {isFormModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000, overflowY: 'auto' }}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div className="modal-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
              <div>
                <h3 className="modal-title" style={{ fontSize: '1.15rem' }}>
                  {editingReport ? `Edit Service Report (${editingReport.reportCode || 'Draft'})` : 'Create New Service Report'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                  Fill in service parameters, upload photos, and complete verification signatures.
                </p>
              </div>
              <button 
                type="button" 
                className="modal-close-btn"
                onClick={() => setIsFormModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveReport} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>
                
                {/* 1. SELECT SITE & DATE */}
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Zone (Pincode Filter)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter pincode..."
                      value={formData.zonePincode || ''}
                      onChange={e => setFormData({ ...formData, zonePincode: e.target.value, siteId: '' })}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Select Site <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select
                      required
                      className="form-control"
                      value={formData.siteId}
                      onChange={e => {
                        setFormData({ ...formData, siteId: e.target.value });
                        if (formErrors.siteId) setFormErrors({ ...formErrors, siteId: null });
                      }}
                    >
                      <option value="">-- Choose Deployed Site --</option>
                      {sites.filter(s => !formData.zonePincode || s.pincode === formData.zonePincode || (s.address && s.address.includes(formData.zonePincode))).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.customerName} ({s.ocNumber || 'No OC'})
                        </option>
                      ))}
                    </select>
                    {formErrors.siteId && (
                      <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {formErrors.siteId}
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Date of Service
                    </label>
                    <div className="form-control" style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                      {formData.date}
                    </div>
                  </div>
                </div>

                {/* 2. TECHNICIAN NAME & ZONE */}
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Technician Name <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      required
                      type="text"
                      className="form-control"
                      placeholder="e.g. Ramesh Kumar"
                      value={formData.technician}
                      onChange={e => {
                        setFormData({ ...formData, technician: e.target.value });
                        if (formErrors.technician) setFormErrors({ ...formErrors, technician: null });
                      }}
                    />
                    {formErrors.technician && (
                      <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {formErrors.technician}
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Zone <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <select
                      className="form-control"
                      value={formData.zone}
                      onChange={e => setFormData({ ...formData, zone: e.target.value })}
                    >
                      <option value="South Zone">South Zone (Tamil Nadu / Kerala / KA)</option>
                      <option value="North Zone">North Zone (Delhi NCR / UP / Punjab)</option>
                      <option value="West Zone">West Zone (Maharashtra / Gujarat)</option>
                      <option value="East Zone">East Zone (WB / Odisha / Bihar)</option>
                      <option value="Central Zone">Central Zone (MP / Chhattisgarh)</option>
                      <option value="Other">Custom / Other Zone</option>
                    </select>

                    {formData.zone === 'Other' && (
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter zone name"
                        style={{ marginTop: '0.5rem' }}
                        value={formData.customZone}
                        onChange={e => setFormData({ ...formData, customZone: e.target.value })}
                      />
                    )}
                  </div>
                </div>

                {/* 3. ATTACHMENTS */}
                <div style={{ background: 'var(--bg-surface-alt)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>
                      Attachments & Photos
                    </label>
                    <label 
                      className="btn btn-secondary btn-small"
                      style={{ cursor: 'pointer', margin: 0, padding: '0.3rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Paperclip size={13} /> Add Photos / Files
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*,.pdf,.doc,.docx"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  {formData.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
                      {formData.attachments.map((file, idx) => (
                        <div 
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: '#FFFFFF',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '0.4rem 0.6rem',
                            fontSize: '0.78rem',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          {file.dataUrl && file.type === 'IMAGE' ? (
                            <img 
                              src={file.dataUrl} 
                              alt="thumb" 
                              style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                              onClick={() => setPreviewAttachment(file)}
                              title="Click to zoom"
                            />
                          ) : (
                            <Paperclip size={14} color="#2563EB" />
                          )}

                          <span 
                            onClick={() => setPreviewAttachment(file)}
                            style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, cursor: 'pointer', color: '#1E293B' }}
                            title="Click to view"
                          >
                            {file.name}
                          </span>

                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(file)}
                            style={{ background: 'transparent', border: 'none', color: '#2563EB', cursor: 'pointer', padding: 0 }}
                            title="View"
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(idx)}
                            style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0 }}
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. REMARKS / WORK DONE */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Remarks / Work Done <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    className="form-control"
                    placeholder="Enter detailed servicing observations, replaced parts, pressure checks, chemical dosing, etc."
                    value={formData.remarks}
                    onChange={e => {
                      setFormData({ ...formData, remarks: e.target.value });
                      if (formErrors.remarks) setFormErrors({ ...formErrors, remarks: null });
                    }}
                  />
                  {formErrors.remarks && (
                    <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {formErrors.remarks}
                    </div>
                  )}
                </div>

                {/* 5. VERIFICATION & SIGNATURES */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    Verification & Signatures
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* LEFT: SERVICE PERSON SIGNATURE */}
                    <div style={{ background: 'var(--bg-surface-alt)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <User size={15} color="var(--accent-color)" /> 1. Service Person Sign-Off
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>
                          Service Person Name <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <input
                          required
                          type="text"
                          className="form-control"
                          placeholder="e.g. Rajesh Kumar"
                          value={formData.servicePersonName}
                          onChange={e => {
                            setFormData({ ...formData, servicePersonName: e.target.value });
                            if (formErrors.servicePersonName) setFormErrors({ ...formErrors, servicePersonName: null });
                          }}
                        />
                        {formErrors.servicePersonName && (
                          <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                            {formErrors.servicePersonName}
                          </div>
                        )}
                      </div>

                      <SignaturePad
                        label="Service Person Signature"
                        value={formData.servicePersonSignature}
                        onChange={(dataUrl) => {
                          setFormData({ ...formData, servicePersonSignature: dataUrl });
                          if (formErrors.servicePersonSignature) setFormErrors({ ...formErrors, servicePersonSignature: null });
                        }}
                        isRequired={true}
                        error={formErrors.servicePersonSignature}
                        placeholder="Service person draw signature here"
                      />
                    </div>

                    {/* RIGHT: CLIENT SIGNATURE OR REMOTE LINK */}
                    <div style={{ background: 'var(--bg-surface-alt)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={15} color="#10B981" /> 2. Client Sign-Off
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>
                          Client / Representative Name <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <input
                          required
                          type="text"
                          className="form-control"
                          placeholder="e.g. Mr. S. Sharma"
                          value={formData.clientName}
                          onChange={e => {
                            setFormData({ ...formData, clientName: e.target.value });
                            if (formErrors.clientName) setFormErrors({ ...formErrors, clientName: null });
                          }}
                        />
                        {formErrors.clientName && (
                          <div style={{ color: '#EF4444', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                            {formErrors.clientName}
                          </div>
                        )}
                      </div>

                      <SignaturePad
                        label="Client Signature"
                        value={formData.clientSignature}
                        onChange={(dataUrl) => {
                          setFormData({ ...formData, clientSignature: dataUrl });
                        }}
                        isRequired={false}
                        placeholder="Client draw signature here (optional on spot)"
                      />
                    </div>

                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setIsFormModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Check size={16} /> {editingReport ? 'Save Changes' : 'Save Service Report'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}



      {/* ══════════════════════════════════════════════════════════════════
          ATTACHMENT LIST MODAL (WHEN REPORT HAS MULTIPLE FILES)
          ══════════════════════════════════════════════════════════════════ */}
      {selectedReportForAttachments && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setSelectedReportForAttachments(null)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '480px', width: '90%', padding: '1.25rem', background: '#FFFFFF', borderRadius: '12px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                <Paperclip size={16} color="var(--accent-color)" /> Attachments ({selectedReportForAttachments.attachments?.length || 0})
              </div>
              <button type="button" onClick={() => setSelectedReportForAttachments(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '55vh', overflowY: 'auto' }}>
              {selectedReportForAttachments.attachments?.map((att, i) => (
                <div 
                  key={i} 
                  onClick={() => setPreviewAttachment(att)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.75rem', 
                    borderRadius: '8px', 
                    background: '#F8FAFC', 
                    border: '1px solid #E2E8F0',
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                    {att.dataUrl && att.type === 'IMAGE' ? (
                      <img src={att.dataUrl} alt="thumb" style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '4px' }} />
                    ) : (
                      <div style={{ width: '34px', height: '34px', background: '#EFF6FF', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Paperclip size={16} color="#2563EB" />
                      </div>
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {att.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{att.size}</div>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-small"
                    onClick={(e) => { e.stopPropagation(); setPreviewAttachment(att); }}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Eye size={12} /> View
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ATTACHMENT VIEWER / LIGHTBOX MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {previewAttachment && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setPreviewAttachment(null)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '650px', width: '92%', padding: '1.25rem', background: '#FFFFFF', borderRadius: '12px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                  {previewAttachment.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  {previewAttachment.size}
                </div>
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
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{previewAttachment.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>Document file ({previewAttachment.size})</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          FULL VIEW / PRINT REPORT MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {viewingReport && (
        <ViewReportModal
          report={viewingReport}
          onClose={() => setViewingReport(null)}
          onEdit={() => {
            const rep = viewingReport;
            setViewingReport(null);
            handleOpenEditReport(rep);
          }}
          onCopyLink={() => handleCopyLink(viewingReport)}
          onPreviewAttachment={(att) => setPreviewAttachment(att)}
          copied={copiedLinkId === viewingReport.id}
        />
      )}

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// FULL VIEW / PRINT REPORT MODAL COMPONENT
// ══════════════════════════════════════════════════════════════════
function ViewReportModal({ report, onClose, onEdit, onCopyLink, onPreviewAttachment, copied }) {
  const isSigned = report.status === 'COMPLETED' || Boolean(report.clientSignature);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100, overflowY: 'auto' }}>
      <div className="modal-content" style={{ maxWidth: '780px', width: '95%', maxHeight: '92vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
              Service Report #{report.reportCode || report.id}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Uploaded on: {report.uploadedAt || 'N/A'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn btn-secondary btn-small"
              onClick={() => window.print()}
            >
              <Printer size={13} /> Print
            </button>
            <button 
              type="button" 
              className="btn btn-primary btn-small"
              onClick={onEdit}
            >
              <Edit3 size={13} /> Edit Report
            </button>
            <button 
              type="button" 
              className="modal-close-btn"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Service Report Document */}
        <div className="modal-body" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#FFFFFF' }}>
          
          {/* Top Company & Code Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--accent-color)', paddingBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                XPREDICT AUTOMATION SOLUTIONS PVT LTD
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Industrial Water & Wastewater Treatment | DMS Service Report
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {report.reportCode || `SR-${report.id}`}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Date: {report.date}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Uploaded: {report.uploadedAt}
              </div>
            </div>
          </div>

          {/* Site & Tech Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'var(--bg-surface-alt)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Client / Site</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{report.siteName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OC Number: {report.ocNumber || 'N/A'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Technician & Zone</div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{report.technician}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zone: {report.zone || 'General'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Report Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                <span 
                  style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: isSigned ? '#F0FDF4' : '#FEF3C7',
                    color: isSigned ? '#16A34A' : '#D97706',
                    border: isSigned ? '1px solid #BBF7D0' : '1px solid #FDE68A'
                  }}
                >
                  {isSigned ? '✓ Signed & Finalized' : '⏳ Awaiting Client Signature'}
                </span>
              </div>
            </div>
          </div>

          {/* Remarks / Work Done */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Service Observations & Work Done
            </h4>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontSize: '0.88rem', lineHeight: '1.5', color: 'var(--text-primary)', background: '#FAFAFA' }}>
              {report.remarks || report.workDone || 'Standard preventive maintenance completed.'}
            </div>
          </div>

          {/* Attachments Section with Click to View */}
          {report.attachments && report.attachments.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                Attached Files & Photos ({report.attachments.length})
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {report.attachments.map((file, i) => (
                  <div 
                    key={i} 
                    onClick={() => onPreviewAttachment && onPreviewAttachment(file)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem', 
                      background: 'var(--bg-surface-alt)', 
                      padding: '0.4rem 0.75rem', 
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                    title="Click to view attachment"
                  >
                    {file.dataUrl && file.type === 'IMAGE' ? (
                      <img src={file.dataUrl} alt="thumb" style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '3px' }} />
                    ) : (
                      <Paperclip size={14} color="var(--accent-color)" />
                    )}
                    <span style={{ fontWeight: 600 }}>{file.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>({file.size})</span>
                    <Eye size={12} color="#2563EB" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signatures Verified Box */}
          <div style={{ borderTop: '2px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
              Signatures & Authorizations
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              
              {/* Technician Sign */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem', textAlign: 'center', background: '#FAFAFA' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Service Engineer / Technician
                </div>
                {report.servicePersonSignature ? (
                  <img 
                    src={report.servicePersonSignature} 
                    alt="Service Person Signature" 
                    style={{ height: '70px', maxWidth: '100%', objectFit: 'contain', margin: '0.25rem auto' }}
                  />
                ) : (
                  <div style={{ height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                    Signature Not Available
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: '0.85rem', borderTop: '1px dashed #CBD5E1', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
                  {report.servicePersonName || report.technician}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Service Personnel
                </div>
              </div>

              {/* Client Sign */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem', textAlign: 'center', background: '#FAFAFA' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Customer / Facility Head
                </div>
                {report.clientSignature ? (
                  <img 
                    src={report.clientSignature} 
                    alt="Client Signature" 
                    style={{ height: '70px', maxWidth: '100%', objectFit: 'contain', margin: '0.25rem auto' }}
                  />
                ) : (
                  <div style={{ height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#D97706', fontSize: '0.78rem', gap: '0.3rem' }}>
                    <span>⏳ Awaiting Client Signature</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={onCopyLink}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    >
                      {copied ? 'Link Copied!' : 'Copy Sign Link'}
                    </button>
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: '0.85rem', borderTop: '1px dashed #CBD5E1', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
                  {report.clientName || 'Client Representative'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {report.clientSignedAt ? `Signed on ${report.clientSignedAt}` : 'Authorized Client Signatory'}
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            <Edit3 size={14} /> Edit This Report
          </button>
        </div>

      </div>
    </div>
  );
}
