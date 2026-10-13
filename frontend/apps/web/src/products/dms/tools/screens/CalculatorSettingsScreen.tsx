import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTools } from '../api/tools';
import { SaveIcon, RefreshCwIcon } from 'lucide-react';

export function CalculatorSettingsScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { calculatorSettings, settingsPending, updateCalculatorSettings } = useTools(orgSlug || '');
  
  const [constants, setConstants] = useState<any>({});

  const [feedback, setFeedback] = useState<{message: string, type: 'success'|'error'} | null>(null);

  useEffect(() => {
    if (calculatorSettings?.constants) {
      setConstants(calculatorSettings.constants);
    }
  }, [calculatorSettings]);

  const showFeedback = (msg: string, type: 'success'|'error' = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleChange = (key: string, value: number) => {
    setConstants((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateCalculatorSettings(
      { constants },
      {
        onSuccess: () => showFeedback("Constants saved successfully!"),
        onError: () => showFeedback("Failed to save constants.", "error")
      }
    );
  };

  if (settingsPending) return <div style={{ padding: '2rem' }}>Loading Master Data...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px', position: 'relative' }}>
      
      {/* Toast Notification */}
      {feedback && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: feedback.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          fontWeight: 600,
          transition: 'all 0.3s ease'
        }}>
          {feedback.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--color-text)' }}>Calculator Constants</h2>
          <p style={{ color: 'var(--color-text-2)' }}>Define the base consumption variables used across the Capacity Calculator.</p>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Home */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text)' }}>Home / Appartments</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Avg Members per House</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.home_avg_members || ''} onChange={e => handleChange('home_avg_members', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Liters per Person (LPD)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.home_lts_pp || ''} onChange={e => handleChange('home_lts_pp', Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Commercial & Schools */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text)' }}>Schools & Commercial</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Schools (Liters per Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.school_lts_pp || ''} onChange={e => handleChange('school_lts_pp', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Commercial/Offices (Liters per Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.commercial_lts_pp || ''} onChange={e => handleChange('commercial_lts_pp', Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Hospitals */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text)' }}>Hospitals</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>OPD (Liters per Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.hosp_opd_lts || ''} onChange={e => handleChange('hosp_opd_lts', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>IPD (Liters per Bed)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.hosp_ipd_lts || ''} onChange={e => handleChange('hosp_ipd_lts', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Extra (Dialysis/Cancer)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.hosp_extra_lts || ''} onChange={e => handleChange('hosp_extra_lts', Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Public Toilets */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text)' }}>Public Toilets</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Toilets (Liters per Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.toilet_lts_pp || ''} onChange={e => handleChange('toilet_lts_pp', Number(e.target.value))} />
            </div>
          </div>
        </div>
        
        {/* Industries & Resorts */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text)' }}>Industries & Resorts</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>STP Base (Liters/Emp)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.stp_emp_lts || ''} onChange={e => handleChange('stp_emp_lts', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>STP Kitchen (Liters/Emp)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.stp_kitchen_lts || ''} onChange={e => handleChange('stp_kitchen_lts', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Resort Base (Liters/Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.resort_lts_pp || ''} onChange={e => handleChange('resort_lts_pp', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Resort Persons per Room</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.resort_persons_pr || ''} onChange={e => handleChange('resort_persons_pr', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Resort Kitchen (Liters/Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.resort_kitchen_lts || ''} onChange={e => handleChange('resort_kitchen_lts', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-2)' }}>Resort Pool (Liters/Person)</label>
              <input type="number" style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }} value={constants.resort_pool_lts || ''} onChange={e => handleChange('resort_pool_lts', Number(e.target.value))} />
            </div>
          </div>
        </div>

      </div>

      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
        <button 
          onClick={() => {
            const defaults = {
                "home_avg_members": 4, 
                "home_lts_pp": 150,
                "school_lts_pp": 45,
                "commercial_lts_pp": 45,
                "hosp_opd_lts": 25,
                "hosp_ipd_lts": 400,
                "hosp_extra_lts": 25,
                "toilet_lts_pp": 15,
                "stp_emp_lts": 45,
                "stp_kitchen_lts": 15,
                "resort_persons_pr": 3,
                "resort_lts_pp": 80,
                "resort_kitchen_lts": 45,
                "resort_pool_lts": 45
            };
            setConstants(defaults);
            updateCalculatorSettings(
              { constants: defaults },
              {
                onSuccess: () => showFeedback("Defaults loaded and saved!"),
                onError: () => showFeedback("Failed to save defaults.", "error")
              }
            );
          }}
          style={{ padding: '0.75rem 1.5rem', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border-strong)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
        >
          <RefreshCwIcon size={16} /> Load Defaults
        </button>
        <button 
          onClick={() => {
            setConstants(calculatorSettings?.constants || {});
            showFeedback("Changes discarded. Reverted to last saved constants.");
          }}
          style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--color-border-strong)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCwIcon size={16} /> Discard Changes
        </button>
        <button 
          onClick={handleSave}
          style={{ padding: '0.75rem 1.5rem', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
        >
          <SaveIcon size={16} /> Save Constants
        </button>
      </div>
    </div>
  );
}
