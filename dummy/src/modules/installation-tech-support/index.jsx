import React, { useState, useEffect } from 'react';
import UserManualDashboard, { initialManuals } from './user-manual';
import MachineVideosDashboard, { initialVideos } from './machine-videos';
import ReqForCallDashboard, { initialCallRequests } from './req-for-call';
import { BookOpen, Video, PhoneCall, Wrench, ShieldCheck } from 'lucide-react';

export default function InstallationTechSupport({ activeTab = 'tech-manuals', onTabChange, enquiries = [] }) {
  // Local active tab fallback if not provided
  const [currentTab, setCurrentTab] = useState(activeTab || 'tech-manuals');
  const [prefillModel, setPrefillModel] = useState('');

  // Live state with localStorage persistence
  const [requests, setRequests] = useState(() => {
    const saved = localStorage.getItem('dms_tech_call_requests');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return initialCallRequests;
  });

  const [manuals, setManuals] = useState(() => {
    const saved = localStorage.getItem('dms_tech_manuals');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return initialManuals;
  });

  const [videos, setVideos] = useState(() => {
    const saved = localStorage.getItem('dms_tech_videos');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return initialVideos;
  });

  useEffect(() => {
    localStorage.setItem('dms_tech_call_requests', JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem('dms_tech_manuals', JSON.stringify(manuals));
  }, [manuals]);

  useEffect(() => {
    localStorage.setItem('dms_tech_videos', JSON.stringify(videos));
  }, [videos]);

  // Keep in sync when parent activeModule changes (e.g. sidebar navigation)
  useEffect(() => {
    if (activeTab && (activeTab === 'tech-manuals' || activeTab === 'tech-videos' || activeTab === 'tech-call')) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  const handleTabClick = (tabId) => {
    setCurrentTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  const handleOpenRequestCall = (modelName) => {
    setPrefillModel(modelName || '');
    handleTabClick('tech-call');
  };

  const pendingCallCount = requests.filter(r => r.status === 'Pending').length;

  const tabs = [
    {
      id: 'tech-manuals',
      label: 'User Manuals',
      icon: <BookOpen size={16} />
    },
    {
      id: 'tech-videos',
      label: 'Machine Videos',
      icon: <Video size={16} />
    },
    {
      id: 'tech-call',
      label: 'Request for Call',
      icon: <PhoneCall size={16} />,
      count: pendingCallCount > 0 ? pendingCallCount : null,
      badgeColor: '#B45309'
    }
  ];

  return (
    <div className="page-container">
      {/* Module Title Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Wrench size={24} style={{ color: 'var(--accent-color)' }} />
            Installation & Technical Support
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.88rem' }}>
            Official equipment handbooks, video demonstrations, and immediate field engineering hotline.
          </p>
        </div>
      </div>

      {/* Modern Tabs Navigation Bar */}
      <div className="module-tabs-bar">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`module-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {Boolean(tab.count) && (
                <span 
                  className="module-tab-count"
                  style={tab.badgeColor && !isActive ? { color: tab.badgeColor, background: '#FEF3C7' } : {}}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {currentTab === 'tech-manuals' && (
          <UserManualDashboard 
            manuals={manuals} 
            setManuals={setManuals} 
            onOpenRequestCall={handleOpenRequestCall} 
          />
        )}

        {currentTab === 'tech-videos' && (
          <MachineVideosDashboard 
            videos={videos} 
            setVideos={setVideos} 
            onOpenRequestCall={handleOpenRequestCall} 
          />
        )}

        {currentTab === 'tech-call' && (
          <ReqForCallDashboard 
            prefillModel={prefillModel} 
            enquiries={enquiries} 
            requests={requests} 
            setRequests={setRequests} 
          />
        )}
      </div>
    </div>
  );
}
