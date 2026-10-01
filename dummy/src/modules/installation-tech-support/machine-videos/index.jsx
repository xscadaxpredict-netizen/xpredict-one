import React, { useState } from 'react';
import { 
  Play, 
  Search, 
  PlusCircle, 
  Video, 
  X, 
  UploadCloud, 
  CheckCircle2, 
  Calendar,
  Link,
  Film
} from 'lucide-react';

export const initialVideos = [
  {
    id: 'v1',
    title: 'Complete Unboxing & Setup: 1000 LPH RO System',
    category: 'Installation',
    description: 'Step-by-step unboxing, skid alignment, plumbing connections, membrane loading in pressure vessels, and dry-run safety checks.',
    uploadedDate: '2026-08-10',
    sourceLink: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    videoFileName: 'RO_1000LPH_Setup_Guide.mp4',
    thumbnailGradient: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
  },
  {
    id: 'v2',
    title: 'Multiport Valve Settings & Brine Regeneration',
    category: 'Operations',
    description: 'How to service the manual multiport valve, switch cycles without water hammer, and perform emergency brine regeneration.',
    uploadedDate: '2026-08-22',
    sourceLink: '',
    videoFileName: 'Softener_Regeneration_Steps.mp4',
    thumbnailGradient: 'linear-gradient(135deg, #334155 0%, #1E293B 100%)'
  },
  {
    id: 'v3',
    title: 'Troubleshooting Low Permeate Flow & High TDS',
    category: 'Troubleshooting',
    description: 'Diagnosing membrane fouling vs scaling, checking feed pump impeller wear, and verifying differential pressure gauges.',
    uploadedDate: '2026-07-15',
    sourceLink: '',
    videoFileName: 'RO_Troubleshooting_Flow.mp4',
    thumbnailGradient: 'linear-gradient(135deg, #475569 0%, #1E293B 100%)'
  },
  {
    id: 'v4',
    title: 'UV Disinfection Lamp & Quartz Sleeve Servicing',
    category: 'Maintenance',
    description: 'Safe removal of fragile quartz sleeves, descaling mineral buildup with citric acid, and installing high-intensity UV-C lamps.',
    uploadedDate: '2026-09-02',
    sourceLink: '',
    videoFileName: 'UV_Lamp_Maintenance.mp4',
    thumbnailGradient: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)'
  },
  {
    id: 'v5',
    title: 'PLC Automation Panel: Sensor Calibration & Fault Reset',
    category: 'Automation',
    description: 'Navigating touchscreen menus, adjusting cut-off setpoints for float switches, calibrating online conductivity transmitter, and fault logs.',
    uploadedDate: '2026-08-30',
    sourceLink: '',
    videoFileName: 'PLC_Sensor_Calibration.mp4',
    thumbnailGradient: 'linear-gradient(135deg, #1E293B 0%, #475569 100%)'
  }
];

export default function MachineVideosDashboard({ 
  videos: propVideos, 
  setVideos: propSetVideos, 
  onOpenRequestCall 
}) {
  const [localVideos, setLocalVideos] = useState(initialVideos);
  const videos = propVideos !== undefined ? propVideos : localVideos;
  const setVideos = propSetVideos !== undefined ? propSetVideos : setLocalVideos;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modals & Feedback
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Form State: strictly requested fields
  const [formData, setFormData] = useState({
    title: '',
    category: 'Installation',
    description: '',
    sourceLink: '',
    videoFile: null,
    videoFileName: ''
  });

  const categories = ['All', 'Installation', 'Operations', 'Troubleshooting', 'Maintenance', 'Automation'];

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        videoFile: file,
        videoFileName: file.name
      }));
    }
  };

  // Submit Handler: Automatically sets uploadedDate
  const handleUploadSubmit = (e) => {
    e.preventDefault();

    if (!formData.title) return;
    if (!formData.sourceLink && !formData.videoFileName) {
      showToast('Please provide either a video source link or select an MP4 file.');
      return;
    }

    // Automatically fetch current date (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    const newVideo = {
      id: `v${Date.now()}`,
      title: formData.title,
      category: formData.category,
      description: formData.description || 'No description provided.',
      uploadedDate: today,
      sourceLink: formData.sourceLink,
      videoFileName: formData.videoFileName || (formData.sourceLink ? 'External Source Link' : 'Machine_Video.mp4'),
      thumbnailGradient: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)'
    };

    setVideos([newVideo, ...videos]);
    setIsUploadModalOpen(false);

    setFormData({
      title: '',
      category: 'Installation',
      description: '',
      sourceLink: '',
      videoFile: null,
      videoFileName: ''
    });

    showToast(`"${newVideo.title}" uploaded successfully!`);
  };

  const filteredVideos = videos.filter(video => {
    const matchesCategory = selectedCategory === 'All' || video.category === selectedCategory;
    const matchesSearch = 
      video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.description.toLowerCase().includes(searchTerm.toLowerCase());
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
            placeholder="Search machine videos..."
            className="form-control search-box"
            style={{ paddingLeft: '2.4rem', borderRadius: '999px', fontSize: '0.85rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={() => setIsUploadModalOpen(true)}>
          <PlusCircle size={16} /> Upload Video
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

      {/* Videos Grid */}
      {filteredVideos.length === 0 ? (
        <div className="table-container" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Video size={40} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
          <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>No videos found</h3>
          <p style={{ fontSize: '0.85rem' }}>Try clearing your search or upload a new machine video.</p>
        </div>
      ) : (
        <div className="video-grid">
          {filteredVideos.map((video) => (
            <div key={video.id} className="video-card" onClick={() => setActiveVideo(video)}>
              {/* Thumbnail */}
              <div className="video-thumb" style={{ background: video.thumbnailGradient }}>
                <div className="play-icon-box">
                  <Play size={24} fill="#FFFFFF" color="#FFFFFF" style={{ marginLeft: '3px' }} />
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span className="badge" style={{ fontSize: '0.72rem' }}>{video.category}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <Calendar size={13} />
                      <span>{video.uploadedDate}</span>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '0.45rem' }}>
                    {video.title}
                  </h3>

                  {video.description && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {video.description}
                    </p>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Film size={13} /> {video.videoFileName || 'Video Tutorial'}
                  </span>
                  <button className="btn btn-secondary btn-small" onClick={(e) => { e.stopPropagation(); setActiveVideo(video); }}>
                    <Play size={13} fill="currentColor" /> Watch Video
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WATCH VIDEO MODAL */}
      {activeVideo && (
        <div className="modal-overlay" onClick={() => setActiveVideo(null)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '780px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'var(--bg-surface-alt)' }}>
              <div>
                <span className="badge" style={{ marginBottom: '0.25rem' }}>{activeVideo.category}</span>
                <h2 className="modal-title" style={{ fontSize: '1.15rem', marginTop: '0.15rem' }}>{activeVideo.title}</h2>
              </div>
              <button className="close-btn" onClick={() => setActiveVideo(null)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Responsive Video Screen */}
              <div style={{
                position: 'relative',
                background: '#0B0F19',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                aspectRatio: '16/9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                color: '#FFFFFF',
                boxShadow: 'var(--shadow-md)'
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.75rem'
                }}>
                  <Play size={26} fill="#FFFFFF" color="#FFFFFF" style={{ marginLeft: '3px' }} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#FFFFFF' }}>
                  {activeVideo.title}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                  {activeVideo.sourceLink ? `Source Link: ${activeVideo.sourceLink}` : `File: ${activeVideo.videoFileName}`}
                </div>
              </div>

              {/* Video Info Section */}
              <div style={{ background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <span>Category: <strong style={{ color: 'var(--text-primary)' }}>{activeVideo.category}</strong></span>
                  <span>Uploaded: <strong style={{ color: 'var(--text-primary)' }}>{activeVideo.uploadedDate}</strong></span>
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                  Video Description
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {activeVideo.description || 'No additional description provided.'}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActiveVideo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD VIDEO MODAL (Strictly Title, Category, Description, Video Link / MP4 File, and auto-fetched Uploaded Date) */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Upload Machine Video</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Add a training or instructional video for technicians & customers
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsUploadModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                
                {/* 1. Video Title * */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    1. Video Title *
                  </label>
                  <input
                    required
                    type="text"
                    className="form-control"
                    placeholder="e.g. 1000 LPH RO Plant Setup & Plumbing Guide"
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
                    <option value="Installation">Installation</option>
                    <option value="Operations">Operations</option>
                    <option value="Troubleshooting">Troubleshooting</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Automation">Automation</option>
                  </select>
                </div>

                {/* 3. Video Description */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    3. Video Description
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Briefly describe what this video demonstrates..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* 4. Upload Video * (Source Link & MP4 File options) */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    4. Upload Video * (Source Link or MP4 File)
                  </label>

                  {/* Option A: Video Source Link */}
                  <div style={{ marginBottom: '0.65rem' }}>
                    <div style={{ position: 'relative' }}>
                      <Link size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="url"
                        className="form-control"
                        style={{ paddingLeft: '2.25rem', fontSize: '0.85rem' }}
                        placeholder="Video Source Link (e.g. https://... or YouTube URL)"
                        value={formData.sourceLink}
                        onChange={(e) => setFormData({ ...formData, sourceLink: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                    — OR —
                  </div>

                  {/* Option B: MP4 File Upload */}
                  <label className="file-upload-box" style={{ cursor: 'pointer', padding: '1rem' }}>
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      className="file-input"
                      onChange={handleFileChange}
                    />
                    <UploadCloud className="icon" size={26} />
                    <span className="text" style={{ fontSize: '0.82rem' }}>
                      {formData.videoFileName ? (
                        <strong style={{ color: 'var(--text-primary)' }}>Selected: {formData.videoFileName}</strong>
                      ) : (
                        'Upload MP4 / WebM video file'
                      )}
                    </span>
                  </label>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Upload Video
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
