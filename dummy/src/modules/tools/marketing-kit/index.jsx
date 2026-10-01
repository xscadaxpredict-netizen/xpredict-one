import React, { useState } from 'react';
import { 
  FileText, 
  Video, 
  Image, 
  Download, 
  Eye, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  Share2, 
  CheckCircle2, 
  X,
  FileCheck,
  PlusCircle,
  UploadCloud,
  Link,
  Film
} from 'lucide-react';

// Default Brochure Records
export const initialBrochures = [
  {
    id: 'b1',
    title: 'Xpredict Master Product Catalog 2026-27',
    category: 'Master Catalog',
    fileName: 'Xpredict_Master_Catalog_2026.pdf',
    fileSize: '8.4 MB',
    description: 'Complete range of Reverse Osmosis plants, automatic water softeners, industrial UV units, and smart automation panels.'
  },
  {
    id: 'b2',
    title: 'Industrial RO Plants (500 to 10,000 LPH)',
    category: 'Product Brochure',
    fileName: 'Industrial_RO_Systems_Brochure.pdf',
    fileSize: '4.2 MB',
    description: 'Technical specs, flow charts, membrane schematics, and energy recovery comparisons for industrial grade RO skids.'
  },
  {
    id: 'b3',
    title: 'Automatic Water Softeners & Media Filters',
    category: 'Product Brochure',
    fileName: 'Water_Softeners_Brochure.pdf',
    fileSize: '3.6 MB',
    description: 'Features multiport valve automation, brine saturation details, and ion-exchange resin capacity ratings.'
  },
  {
    id: 'b4',
    title: 'IoT Cloud-Connected Automation Panels',
    category: 'Automation Kit',
    fileName: 'Smart_PLC_IoT_Brochure.pdf',
    fileSize: '2.9 MB',
    description: 'Remote telemetry, mobile app alerts, RS-485 Modbus integration, and cloud dashboard overview for industrial plants.'
  }
];

// Default Video Records
export const initialVideos = [
  {
    id: 'v1',
    title: 'Xpredict Corporate & Manufacturing Tour',
    duration: '03:15 min',
    resolution: '4K Ultra HD',
    fileName: 'Xpredict_Corporate_Tour.mp4',
    description: 'High production quality factory tour highlighting our state-of-the-art testing facility, welding, and QC standards.'
  },
  {
    id: 'v2',
    title: '1000 LPH RO System Live Product Demonstration',
    duration: '04:30 min',
    resolution: '1080p Full HD',
    fileName: 'RO_1000LPH_Demo.mp4',
    description: 'Customer-facing demonstration showcasing automated flushing, quiet high-pressure pump, and touchscreen interface.'
  },
  {
    id: 'v3',
    title: 'Client Success Story: Beverage & Bottling Plant',
    duration: '02:45 min',
    resolution: '1080p Full HD',
    fileName: 'Beverage_Client_Story.mp4',
    description: 'Case study interview explaining 40% reduction in water rejection and consistent <10 TDS output.'
  }
];

// Default Ads & Banners Records
export const initialAds = [
  {
    id: 'a1',
    title: 'World Water Day Campaign Poster',
    format: 'Instagram / LinkedIn Square (1080x1080)',
    fileName: 'World_Water_Day_Creative.png',
    fileSize: '1.8 MB',
    description: 'Eye-catching promotional creative highlighting sustainable water conservation and efficient RO recovery.'
  },
  {
    id: 'a2',
    title: 'Authorized Dealership Opportunity Banner',
    format: 'WhatsApp Story & Status (1080x1920)',
    fileName: 'Dealership_Invitation_Banner.png',
    fileSize: '2.1 MB',
    description: 'Recruitment flyer for regional dealers and water treatment distributors with customizable contact box.'
  },
  {
    id: 'a3',
    title: 'Industrial Exhibition Roll-Up Standee',
    format: 'High-Res Print Ready (6ft x 3ft)',
    fileName: 'Exhibition_Standee_PrintReady.pdf',
    fileSize: '15.4 MB',
    description: 'Trade show and expo roll-up standee banner layout featuring full turnkey STP, ETP, and RO solutions.'
  },
  {
    id: 'a4',
    title: 'Commercial Water Softener Benefits Flyer',
    format: 'A4 Digital Leaflet',
    fileName: 'Softener_Benefits_Flyer.png',
    fileSize: '3.1 MB',
    description: 'Customer handout explaining boiler scale prevention, plumbing protection, and detergent savings.'
  }
];

export default function MarketingKitDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [openSections, setOpenSections] = useState({
    brochures: false,
    videos: false,
    ads: false
  });

  // Dynamic Lists for Uploading
  const [brochures, setBrochures] = useState(initialBrochures);
  const [videos, setVideos] = useState(initialVideos);
  const [ads, setAds] = useState(initialAds);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState('brochure'); // 'brochure' | 'video' | 'ad'
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Product Brochure',
    format: 'Instagram / LinkedIn Square (1080x1080)',
    duration: '03:00 min',
    sourceLink: '',
    fileName: '',
    file: null
  });

  // Modal & Toast states
  const [previewItem, setPreviewItem] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const toggleSection = (section) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleOpenUpload = (preselectedType = 'brochure') => {
    setUploadType(preselectedType);
    setFormData({
      title: '',
      description: '',
      category: 'Product Brochure',
      format: 'Instagram / LinkedIn Square (1080x1080)',
      duration: '03:00 min',
      sourceLink: '',
      fileName: '',
      file: null
    });
    setIsUploadModalOpen(true);
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

  const handleUploadSubmit = (e) => {
    e.preventDefault();

    if (!formData.title) return;

    if (uploadType === 'brochure') {
      const newBrochure = {
        id: `b${Date.now()}`,
        title: formData.title,
        category: formData.category || 'Product Brochure',
        fileName: formData.fileName || `${formData.title.replace(/\s+/g, '_')}.pdf`,
        fileSize: '3.5 MB',
        description: formData.description || 'Official product brochure and technical specs.'
      };
      setBrochures([newBrochure, ...brochures]);
      setOpenSections(prev => ({ ...prev, brochures: true }));
      showToast(`Brochure "${newBrochure.title}" uploaded successfully!`);
    } else if (uploadType === 'video') {
      const newVideo = {
        id: `v${Date.now()}`,
        title: formData.title,
        duration: formData.duration || '03:30 min',
        resolution: '1080p Full HD',
        fileName: formData.fileName || (formData.sourceLink ? 'Video Link' : 'Machine_Promo.mp4'),
        description: formData.description || 'Promotional machine demonstration video.'
      };
      setVideos([newVideo, ...videos]);
      setOpenSections(prev => ({ ...prev, videos: true }));
      showToast(`Video "${newVideo.title}" uploaded successfully!`);
    } else if (uploadType === 'ad') {
      const newAd = {
        id: `a${Date.now()}`,
        title: formData.title,
        format: formData.format || 'Digital Creative',
        fileName: formData.fileName || `${formData.title.replace(/\s+/g, '_')}.png`,
        fileSize: '2.4 MB',
        description: formData.description || 'Marketing campaign and advertising asset.'
      };
      setAds([newAd, ...ads]);
      setOpenSections(prev => ({ ...prev, ads: true }));
      showToast(`Ad Creative "${newAd.title}" uploaded successfully!`);
    }

    setIsUploadModalOpen(false);
  };

  // Filter items
  const filteredBrochures = brochures.filter(b => 
    b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVideos = videos.filter(v => 
    v.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAds = ads.filter(a => 
    a.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      {/* Header with Search & Upload Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search marketing materials, ads, brochures..."
            className="form-control search-box"
            style={{ paddingLeft: '2.4rem', borderRadius: '999px', fontSize: '0.85rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Upload Button */}
        <button className="btn btn-primary" onClick={() => handleOpenUpload('brochure')}>
          <PlusCircle size={16} /> Upload Material
        </button>
      </div>

      {/* Accordion Group */}
      <div className="marketing-accordion-group">
        
        {/* ACCORDION 1: BROCHURES */}
        <div className={`marketing-accordion-item ${openSections.brochures ? 'open' : ''}`}>
          <div className="marketing-accordion-header" onClick={() => toggleSection('brochures')}>
            <div className="marketing-accordion-title">
              <FileText size={20} style={{ color: 'var(--accent-color)' }} />
              <span>Brochures & Catalogs</span>
              <span className="badge" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                {filteredBrochures.length} Items
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary btn-small"
                onClick={(e) => { e.stopPropagation(); handleOpenUpload('brochure'); }}
                style={{ fontSize: '0.75rem' }}
              >
                + Add Brochure
              </button>
              {openSections.brochures ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>

          {openSections.brochures && (
            <div className="marketing-accordion-body">
              {filteredBrochures.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No brochures match your search.</div>
              ) : (
                <div className="marketing-grid">
                  {filteredBrochures.map(b => (
                    <div key={b.id} className="marketing-card">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span className="badge" style={{ fontSize: '0.7rem' }}>{b.category}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{b.fileSize}</span>
                        </div>
                        <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', lineHeight: 1.35 }}>
                          {b.title}
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.9rem' }}>
                          {b.description}
                        </p>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-small" onClick={() => setPreviewItem({ ...b, type: 'brochure' })}>
                          <Eye size={13} /> Preview
                        </button>
                        <button className="btn btn-primary btn-small" onClick={() => showToast(`Downloading ${b.fileName}...`)}>
                          <Download size={13} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ACCORDION 2: VIDEOS */}
        <div className={`marketing-accordion-item ${openSections.videos ? 'open' : ''}`}>
          <div className="marketing-accordion-header" onClick={() => toggleSection('videos')}>
            <div className="marketing-accordion-title">
              <Video size={20} style={{ color: 'var(--accent-color)' }} />
              <span>Promotional & Product Videos</span>
              <span className="badge" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                {filteredVideos.length} Videos
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary btn-small"
                onClick={(e) => { e.stopPropagation(); handleOpenUpload('video'); }}
                style={{ fontSize: '0.75rem' }}
              >
                + Add Video
              </button>
              {openSections.videos ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>

          {openSections.videos && (
            <div className="marketing-accordion-body">
              {filteredVideos.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No promotional videos match your search.</div>
              ) : (
                <div className="marketing-grid">
                  {filteredVideos.map(v => (
                    <div key={v.id} className="marketing-card">
                      <div>
                        {/* Video Thumbnail Frame */}
                        <div style={{
                          height: '130px',
                          background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          position: 'relative',
                          marginBottom: '0.75rem',
                          cursor: 'pointer'
                        }} onClick={() => setPreviewItem({ ...v, type: 'video' })}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Play size={20} fill="#FFFFFF" color="#FFFFFF" style={{ marginLeft: '2px' }} />
                          </div>
                          <span style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                            {v.duration}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{v.resolution}</div>
                        <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', lineHeight: 1.35 }}>
                          {v.title}
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.9rem' }}>
                          {v.description}
                        </p>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-small" onClick={() => setPreviewItem({ ...v, type: 'video' })}>
                          <Play size={13} fill="currentColor" /> Watch
                        </button>
                        <button className="btn btn-primary btn-small" onClick={() => showToast(`Copied sharing link for "${v.title}"!`)}>
                          <Share2 size={13} /> Share Link
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ACCORDION 3: ADS & SOCIAL MEDIA BANNERS */}
        <div className={`marketing-accordion-item ${openSections.ads ? 'open' : ''}`}>
          <div className="marketing-accordion-header" onClick={() => toggleSection('ads')}>
            <div className="marketing-accordion-title">
              <Image size={20} style={{ color: 'var(--accent-color)' }} />
              <span>Digital Ads, Social Posters & Banners</span>
              <span className="badge" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                {filteredAds.length} Creatives
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary btn-small"
                onClick={(e) => { e.stopPropagation(); handleOpenUpload('ad'); }}
                style={{ fontSize: '0.75rem' }}
              >
                + Add Ad Banner
              </button>
              {openSections.ads ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>

          {openSections.ads && (
            <div className="marketing-accordion-body">
              {filteredAds.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No ad creatives match your search.</div>
              ) : (
                <div className="marketing-grid">
                  {filteredAds.map(a => (
                    <div key={a.id} className="marketing-card">
                      <div>
                        {/* Banner Preview Frame */}
                        <div style={{
                          height: '120px',
                          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          padding: '0.75rem',
                          textAlign: 'center',
                          marginBottom: '0.75rem'
                        }}>
                          <Image size={24} style={{ opacity: 0.6, marginBottom: '0.25rem' }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#CBD5E1' }}>{a.format}</span>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-color)', fontWeight: 600, marginBottom: '0.2rem' }}>{a.format}</div>
                        <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', lineHeight: 1.35 }}>
                          {a.title}
                        </h4>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.9rem' }}>
                          {a.description}
                        </p>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-small" onClick={() => setPreviewItem({ ...a, type: 'ad' })}>
                          <Eye size={13} /> View
                        </button>
                        <button className="btn btn-primary btn-small" onClick={() => showToast(`Downloading ${a.fileName}...`)}>
                          <Download size={13} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* UPLOAD MATERIAL MODAL */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Upload Marketing Material</h2>
              <button className="close-btn" onClick={() => setIsUploadModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                
                {/* 1. Asset Type Selector */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Select Material Type *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${uploadType === 'brochure' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                      onClick={() => setUploadType('brochure')}
                      style={{ justifyContent: 'center' }}
                    >
                      <FileText size={14} /> Brochure
                    </button>
                    <button
                      type="button"
                      className={`btn ${uploadType === 'video' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                      onClick={() => setUploadType('video')}
                      style={{ justifyContent: 'center' }}
                    >
                      <Video size={14} /> Video
                    </button>
                    <button
                      type="button"
                      className={`btn ${uploadType === 'ad' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                      onClick={() => setUploadType('ad')}
                      style={{ justifyContent: 'center' }}
                    >
                      <Image size={14} /> Ad Banner
                    </button>
                  </div>
                </div>

                {/* 2. Material Title * */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Material Title *
                  </label>
                  <input
                    required
                    type="text"
                    className="form-control"
                    placeholder={
                      uploadType === 'brochure' ? 'e.g. RO Plant 2000 LPH Commercial Brochure' :
                      uploadType === 'video' ? 'e.g. Factory Assembly Tour 2026' :
                      'e.g. World Water Day Campaign Poster'
                    }
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* 3. Category / Format based on Type */}
                {uploadType === 'brochure' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Brochure Category *
                    </label>
                    <select
                      className="form-control"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="Product Brochure">Product Brochure</option>
                      <option value="Master Catalog">Master Catalog</option>
                      <option value="Automation Kit">Automation Kit</option>
                      <option value="Technical Datasheet">Technical Datasheet</option>
                    </select>
                  </div>
                )}

                {uploadType === 'video' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Duration (mm:ss)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 03:45 min"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    />
                  </div>
                )}

                {uploadType === 'ad' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Banner / Ad Format *
                    </label>
                    <select
                      className="form-control"
                      value={formData.format}
                      onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                    >
                      <option value="Instagram / LinkedIn Square (1080x1080)">Instagram / LinkedIn Square (1080x1080)</option>
                      <option value="WhatsApp Story & Status (1080x1920)">WhatsApp Story & Status (1080x1920)</option>
                      <option value="High-Res Print Ready (6ft x 3ft)">Exhibition Roll-up Standee (6ft x 3ft)</option>
                      <option value="A4 Digital Leaflet">A4 Digital Leaflet / Flyer</option>
                    </select>
                  </div>
                )}

                {/* 4. Description */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Description
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Briefly describe this marketing asset..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* 5. File Upload / Link */}
                {uploadType === 'video' ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Upload Video File (MP4) or Source Link *
                    </label>
                    <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                      <Link size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="url"
                        className="form-control"
                        style={{ paddingLeft: '2.25rem' }}
                        placeholder="Video URL (e.g. YouTube / Vimeo / Cloud link)"
                        value={formData.sourceLink}
                        onChange={(e) => setFormData({ ...formData, sourceLink: e.target.value })}
                      />
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}>— OR —</div>
                    <label className="file-upload-box" style={{ padding: '1rem', cursor: 'pointer' }}>
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        className="file-input"
                        onChange={handleFileChange}
                      />
                      <UploadCloud className="icon" size={24} />
                      <span className="text" style={{ fontSize: '0.82rem' }}>
                        {formData.fileName ? <strong>{formData.fileName}</strong> : 'Upload MP4 video file'}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Upload {uploadType === 'brochure' ? 'PDF Document' : 'Creative Image'} *
                    </label>
                    <label className="file-upload-box" style={{ cursor: 'pointer', padding: '1.25rem' }}>
                      <input
                        type="file"
                        accept={uploadType === 'brochure' ? '.pdf' : 'image/*,.pdf'}
                        className="file-input"
                        onChange={handleFileChange}
                      />
                      <UploadCloud className="icon" size={28} />
                      <span className="text">
                        {formData.fileName ? (
                          <strong style={{ color: 'var(--text-primary)' }}>Selected: {formData.fileName}</strong>
                        ) : (
                          `Click to browse or drop ${uploadType === 'brochure' ? 'PDF brochure' : 'image creative'}`
                        )}
                      </span>
                    </label>
                  </div>
                )}

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Upload Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewItem(null)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'var(--bg-surface-alt)' }}>
              <div>
                <span className="badge" style={{ marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                  {previewItem.type === 'brochure' ? 'PDF Brochure' : previewItem.type === 'video' ? 'Video Demo' : 'Marketing Ad Asset'}
                </span>
                <h2 className="modal-title" style={{ fontSize: '1.15rem', marginTop: '0.15rem' }}>{previewItem.title}</h2>
              </div>
              <button className="close-btn" onClick={() => setPreviewItem(null)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Media Preview Box */}
              <div style={{
                background: '#0B0F19',
                borderRadius: 'var(--radius-sm)',
                padding: '3rem 1.5rem',
                textAlign: 'center',
                color: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {previewItem.type === 'video' ? (
                  <>
                    <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                      <Play size={24} fill="#FFFFFF" color="#FFFFFF" style={{ marginLeft: '3px' }} />
                    </div>
                    <div style={{ fontWeight: 600 }}>{previewItem.title}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.25rem' }}>Duration: {previewItem.duration}</div>
                  </>
                ) : (
                  <>
                    <FileCheck size={44} style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }} />
                    <div style={{ fontWeight: 600 }}>{previewItem.fileName}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.25rem' }}>Official Xpredict Marketing Asset</div>
                  </>
                )}
              </div>

              <div style={{ background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Asset Description
                </div>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {previewItem.description}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewItem(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { showToast(`Downloading ${previewItem.fileName}...`); setPreviewItem(null); }}>
                <Download size={15} /> Download Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
