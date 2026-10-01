import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Search, 
  PlusCircle, 
  BookOpen, 
  X, 
  UploadCloud, 
  CheckCircle2, 
  Eye, 
  Calendar,
  FileCheck
} from 'lucide-react';

export const initialManuals = [
  {
    id: 'm1',
    title: 'RO Plant 1000 LPH Fully Automatic User Guide',
    category: 'RO Plants',
    fileName: 'RO_Plant_1000LPH_Manual.pdf',
    uploadedDate: '2026-08-15',
    contentPreview: 'This manual covers complete operation, plumbing diagram, membrane installation, high pressure pump startup, auto-flush cycle, and troubleshooting for the 1000 LPH Fully Automatic Reverse Osmosis system.'
  },
  {
    id: 'm2',
    title: 'Industrial Water Softener 2000 LPH Manual',
    category: 'Water Softeners',
    fileName: 'Water_Softener_2000LPH_Guide.pdf',
    uploadedDate: '2026-07-20',
    contentPreview: 'Comprehensive instructions for multiport valve operation, resin regeneration cycles, brine tank preparation, and post-regeneration water hardness testing.'
  },
  {
    id: 'm3',
    title: 'UV Sterilizer 500 LPH Installation & Safety Handbook',
    category: 'UV Systems',
    fileName: 'UV_Sterilizer_500LPH_Handbook.pdf',
    uploadedDate: '2026-09-01',
    contentPreview: 'Safety guidelines, quartz sleeve cleaning procedure, germicidal lamp replacement schedules, and electrical ballast wiring for 500 LPH UV disinfection units.'
  },
  {
    id: 'm4',
    title: 'Smart PLC Automation Panel V2 Operation Manual',
    category: 'Automation / PLC',
    fileName: 'PLC_Panel_V2_User_Manual.pdf',
    uploadedDate: '2026-09-10',
    contentPreview: 'Wiring layout, digital/analog input mapping, conductivity sensor calibration, float switch interlock logic, and touchscreen fault diagnostics.'
  }
];

export default function UserManualDashboard({ 
  manuals: propManuals, 
  setManuals: propSetManuals, 
  onOpenRequestCall 
}) {
  const [localManuals, setLocalManuals] = useState(initialManuals);
  const manuals = propManuals !== undefined ? propManuals : localManuals;
  const setManuals = propSetManuals !== undefined ? propSetManuals : setLocalManuals;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modals & Feedback
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [viewingManual, setViewingManual] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Form State: strictly requested fields
  const [formData, setFormData] = useState({
    title: '',
    category: 'RO Plants',
    file: null,
    fileName: ''
  });

  const categories = ['All', 'RO Plants', 'Water Softeners', 'UV Systems', 'Automation / PLC', 'Chemical Dosing'];

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        file,
        fileName: file.name
      }));
    }
  };

  // Submit Handler: Automatically sets uploadedDate
  const handleUploadSubmit = (e) => {
    e.preventDefault();

    if (!formData.title) return;

    // Automatically fetch current date (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    const newManual = {
      id: `m${Date.now()}`,
      title: formData.title,
      category: formData.category,
      fileName: formData.fileName || `${formData.title.replace(/\s+/g, '_')}.pdf`,
      uploadedDate: today,
      contentPreview: `Official documentation and instructions for ${formData.title}. Uploaded on ${today}.`
    };

    setManuals([newManual, ...manuals]);
    setIsUploadModalOpen(false);

    setFormData({
      title: '',
      category: 'RO Plants',
      file: null,
      fileName: ''
    });

    showToast(`"${newManual.title}" uploaded successfully!`);
  };

  const handleDownload = (manual) => {
    showToast(`Downloading "${manual.fileName}"...`);
  };

  const filteredManuals = manuals.filter(manual => {
    const matchesCategory = selectedCategory === 'All' || manual.category === selectedCategory;
    const matchesSearch = 
      manual.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manual.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manual.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--accent-dark)',
          color: '#FFFFFF',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          zIndex: 1500,
          fontSize: '0.88rem',
          fontWeight: 500,
          borderLeft: '4px solid var(--success)'
        }}>
          <CheckCircle2 size={18} color="var(--success)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header, Search & Upload Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search manuals by title or category..."
            className="form-control search-box"
            style={{ paddingLeft: '2.4rem', borderRadius: '999px', fontSize: '0.85rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={() => setIsUploadModalOpen(true)}>
          <PlusCircle size={16} /> Upload Manual
        </button>
      </div>

      {/* Category Filter Chips */}
      <div className="filter-chips-wrapper">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Manuals Grid */}
      {filteredManuals.length === 0 ? (
        <div className="table-container" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileText size={40} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
          <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>No manuals found</h3>
          <p style={{ fontSize: '0.85rem' }}>Try clearing your search or upload a new manual.</p>
        </div>
      ) : (
        <div className="manual-grid">
          {filteredManuals.map((manual) => (
            <div key={manual.id} className="manual-card">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <span className="badge" style={{ fontSize: '0.72rem' }}>{manual.category}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <Calendar size={13} />
                    <span>{manual.uploadedDate}</span>
                  </div>
                </div>

                <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '0.45rem' }}>
                  {manual.title}
                </h3>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-color)', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                  <FileText size={14} />
                  <span>{manual.fileName}</span>
                </div>

                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '1rem' }}>
                  {manual.contentPreview}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-small" onClick={() => setViewingManual(manual)}>
                  <Eye size={14} /> View Manual
                </button>
                <button className="btn btn-primary btn-small" onClick={() => handleDownload(manual)}>
                  <Download size={14} /> Download PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW MANUAL MODAL */}
      {viewingManual && (
        <div className="modal-overlay" onClick={() => setViewingManual(null)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'var(--bg-surface-alt)' }}>
              <div>
                <span className="badge" style={{ marginBottom: '0.3rem' }}>{viewingManual.category}</span>
                <h2 className="modal-title" style={{ fontSize: '1.15rem', marginTop: '0.15rem' }}>{viewingManual.title}</h2>
              </div>
              <button className="close-btn" onClick={() => setViewingManual(null)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-alt)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Document: </span>
                  <strong>{viewingManual.fileName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Uploaded: </span>
                  <strong>{viewingManual.uploadedDate}</strong>
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-sm)', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Document Overview
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {viewingManual.contentPreview}
                </p>
              </div>

              {/* PDF Preview Frame Simulation */}
              <div style={{ border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '2.5rem 1.5rem', textAlign: 'center', background: 'var(--bg-surface)' }}>
                <FileCheck size={48} style={{ color: 'var(--accent-color)', margin: '0 auto 0.75rem auto' }} />
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {viewingManual.fileName}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Official Xpredict Automation Document (PDF)
                </div>
                <div style={{ marginTop: '1.25rem' }}>
                  <button className="btn btn-primary" onClick={() => handleDownload(viewingManual)}>
                    <Download size={15} /> Download PDF to Read Full Manual
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewingManual(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => handleDownload(viewingManual)}>
                <Download size={15} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD MANUAL MODAL (Strictly 3 input fields + auto-fetched Uploaded Date) */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Upload User Manual</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Add equipment documentation for customers & technicians
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsUploadModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                
                {/* 1. Manual Title * */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    1. Manual Title *
                  </label>
                  <input
                    required
                    type="text"
                    className="form-control"
                    placeholder="e.g. RO Plant 1000 LPH Installation Guide"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* 2. Category * */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    2. Category *
                  </label>
                  <select
                    required
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="RO Plants">RO Plants</option>
                    <option value="Water Softeners">Water Softeners</option>
                    <option value="UV Systems">UV Systems</option>
                    <option value="Automation / PLC">Automation / PLC</option>
                    <option value="Chemical Dosing">Chemical Dosing</option>
                  </select>
                </div>

                {/* 3. Upload Document (PDF) * */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    3. Upload Document (PDF) *
                  </label>
                  <label className="file-upload-box" style={{ cursor: 'pointer' }}>
                    <input
                      type="file"
                      accept=".pdf"
                      className="file-input"
                      onChange={handleFileChange}
                    />
                    <UploadCloud className="icon" size={30} />
                    <span className="text">
                      {formData.fileName ? (
                        <strong style={{ color: 'var(--text-primary)' }}>Selected: {formData.fileName}</strong>
                      ) : (
                        'Click to browse or drop equipment manual (PDF)'
                      )}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Supports PDF documents up to 25MB
                    </span>
                  </label>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Upload Manual
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
