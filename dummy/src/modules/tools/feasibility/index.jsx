import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, FileCheck, Layers, Droplets } from 'lucide-react';

export default function FeasibilityDashboard() {
  const [checks, setChecks] = useState({
    rawWaterTested: true,
    powerAvailable: true,
    drainageProvided: true,
    spaceClearance: false,
    storageTankReady: false
  });

  const toggleCheck = (k) => setChecks(prev => ({ ...prev, [k]: !prev[k] }));

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
        Site Feasibility & Pre-Installation Checklist
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Verify customer site infrastructure and raw water conditions before finalizing equipment delivery.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[
          { key: 'rawWaterTested', label: 'Raw Water Lab Test Report Available (TDS, Hardness, Silica, Heavy Metals)' },
          { key: 'powerAvailable', label: 'Dedicated 3-Phase 415V AC Power Supply with Earthing (< 2V Neutral-to-Earth)' },
          { key: 'drainageProvided', label: 'Gravity Drain or Sump Pit for Reject Water & Backwash Discharge' },
          { key: 'spaceClearance', label: 'Minimum 150 sq.ft Level Concrete Floor with Overhead Clearance' },
          { key: 'storageTankReady', label: 'Treated Water Storage Tank & Raw Water Feed Tank Ready on Site' }
        ].map(item => (
          <div
            key={item.key}
            onClick={() => toggleCheck(item.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: checks[item.key] ? 'var(--bg-surface-alt)' : 'var(--bg-surface)',
              border: checks[item.key] ? '1px solid #BBF7D0' : '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              border: checks[item.key] ? 'none' : '2px solid var(--border-color)',
              background: checks[item.key] ? 'var(--success)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF'
            }}>
              {checks[item.key] && <CheckCircle2 size={16} />}
            </div>
            <span style={{ fontSize: '0.88rem', fontWeight: checks[item.key] ? 600 : 500, color: checks[item.key] ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
