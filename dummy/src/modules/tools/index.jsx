import React, { useState, useEffect } from 'react';
import MarketingKitDashboard from './marketing-kit';
import CapacityCalculatorDashboard from './capacity-calculator';
import FeasibilityDashboard from './feasibility';
import { PenTool, Calculator, Briefcase, Sparkles } from 'lucide-react';

export default function ToolsModule({ activeTab = 'tools-marketing', onTabChange }) {
  const [currentTab, setCurrentTab] = useState(activeTab || 'tools-marketing');

  useEffect(() => {
    if (activeTab && (activeTab === 'tools-marketing' || activeTab === 'tools-capacity' || activeTab === 'tools-feasibility')) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  const handleTabClick = (tabId) => {
    setCurrentTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  const tabs = [
    {
      id: 'tools-marketing',
      label: 'Marketing Kit',
      icon: <Briefcase size={16} />
    },
    {
      id: 'tools-capacity',
      label: 'Capacity Calculator',
      icon: <Calculator size={16} />
    }
  ];

  return (
    <div className="page-container">
      {/* Page Title */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <PenTool size={24} style={{ color: 'var(--accent-color)' }} />
            Sales & Technical Tools
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.88rem' }}>
            Marketing assets, product brochures, video demonstrations, and water treatment plant capacity sizing.
          </p>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
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
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {currentTab === 'tools-marketing' && (
          <MarketingKitDashboard />
        )}

        {currentTab === 'tools-capacity' && (
          <CapacityCalculatorDashboard />
        )}

        {currentTab === 'tools-feasibility' && (
          <FeasibilityDashboard />
        )}
      </div>
    </div>
  );
}
