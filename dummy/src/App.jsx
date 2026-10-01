import React, { useState, useEffect } from 'react';
import FollowupsDashboard, { initialEnquiries } from './modules/crm/followups';
import ConfirmedOrders from './modules/crm/orders';
import SiteServicesDashboard from './modules/site-services';
import EcommerceDashboard from './modules/ecommerce';
import InstallationTechSupport from './modules/installation-tech-support';
import ToolsModule from './modules/tools';
import StandaloneClientSign from './modules/site-services/StandaloneClientSign';
import { Menu, X, Users, PenTool, Wrench, ShoppingCart, Settings } from 'lucide-react';

function App() {
  const getInitialSignReportId = () => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#sign-')) return hash.replace('#sign-', '');
    if (hash.startsWith('#client-sign')) {
      const match = hash.match(/reportId=([^&]+)/);
      if (match) return match[1];
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('signReport') || params.get('reportId') || null;
  };

  const [clientSignReportId, setClientSignReportId] = useState(getInitialSignReportId);
  const [activeModule, setActiveModule] = useState('crm-followups');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [enquiries, setEnquiries] = useState(() => {
    const saved = localStorage.getItem('crm_enquiries_v4');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return initialEnquiries; }
    }
    return initialEnquiries;
  });

  useEffect(() => {
    localStorage.setItem('crm_enquiries_v4', JSON.stringify(enquiries));
  }, [enquiries]);

  useEffect(() => {
    const handleHash = () => {
      setClientSignReportId(getInitialSignReportId());
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (clientSignReportId) {
    return (
      <StandaloneClientSign 
        reportId={clientSignReportId} 
        enquiries={enquiries} 
        setEnquiries={setEnquiries}
        onBackToPortal={() => {
          window.location.hash = '';
          setClientSignReportId(null);
        }}
      />
    );
  }

  const navigation = [
    {
      title: 'CRM',
      icon: <Users size={16} />,
      items: [
        { id: 'crm-followups', label: 'Enquiries' },
        { id: 'crm-orders', label: 'Confirmed Orders' }
      ]
    },
    {
      title: 'Site Service',
      icon: <Settings size={16} />,
      items: [
        { id: 'site-services', label: 'Service Dashboard' }
      ]
    },
    {
      title: 'Installation / Tech',
      icon: <Wrench size={16} />,
      items: [
        { id: 'tech-manuals', label: 'User Manual' },
        { id: 'tech-videos', label: 'Machine Videos' },
        { id: 'tech-call', label: 'Req for Call' }
      ]
    },
    {
      title: 'Ecommerce',
      icon: <ShoppingCart size={16} />,
      items: [
        { id: 'ecom-purchase', label: 'Purchase Module' }
      ]
    },
    {
      title: 'Tools',
      icon: <PenTool size={16} />,
      items: [
        { id: 'tools-marketing', label: 'Marketing Kit' },
        { id: 'tools-feasibility', label: 'Feasibility' },
        { id: 'tools-capacity', label: 'Capacity Calculator' }
      ]
    }
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="header-title" style={{ width: '100%' }}>
            <span>DMS</span> Portal
          </div>
          <button className="mobile-menu-btn" style={{ marginLeft: 'auto' }} onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <div className="nav-menu">
          {navigation.map(section => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {section.icon} {section.title}
              </div>
              {section.items.map(item => (
                <div 
                  key={item.id} 
                  className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
                  onClick={() => { setActiveModule(item.id); setIsSidebarOpen(false); }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="header-title mobile-only">
              <span>DMS</span>
            </div>
          </div>
          
          <div className="user-profile">
            <div className="user-info">
              <div className="user-name">John Doe</div>
              <div className="user-role">Sales Executive</div>
            </div>
            <div className="avatar">JD</div>
            <button className="logout-btn">
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="page-wrapper" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
          {activeModule === 'crm-followups' && <FollowupsDashboard enquiries={enquiries} setEnquiries={setEnquiries} />}
          {activeModule === 'crm-orders' && <ConfirmedOrders enquiries={enquiries} setEnquiries={setEnquiries} />}
          {(activeModule.startsWith('site-') || activeModule === 'site-services') && (
            <SiteServicesDashboard 
              activeModule={activeModule} 
              onModuleChange={(modId) => setActiveModule(modId)} 
              enquiries={enquiries} 
              setEnquiries={setEnquiries} 
            />
          )}
          {activeModule === 'ecom-purchase' && <EcommerceDashboard enquiries={enquiries} setEnquiries={setEnquiries} />}
          
          {activeModule.startsWith('tech-') && (
            <InstallationTechSupport activeTab={activeModule} onTabChange={(tabId) => setActiveModule(tabId)} enquiries={enquiries} />
          )}

          {activeModule.startsWith('tools-') && (
            <ToolsModule activeTab={activeModule} onTabChange={(tabId) => setActiveModule(tabId)} />
          )}

          {!activeModule.startsWith('crm-') && !activeModule.startsWith('site-') && activeModule !== 'site-services' && activeModule !== 'ecom-purchase' && !activeModule.startsWith('tech-') && !activeModule.startsWith('tools-') && (
            <div className="page-container">
              <h2 className="page-title">Module Under Construction</h2>
              <p style={{ color: 'var(--text-muted)' }}>This section is currently being built.</p>
            </div>
          )}
        </main>
      </div>
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div className="modal-overlay" style={{ zIndex: 90 }} onClick={() => setIsSidebarOpen(false)}></div>
      )}
    </div>
  );
}

export default App;
