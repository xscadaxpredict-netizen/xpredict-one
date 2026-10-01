import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Droplets, 
  Clock, 
  Users, 
  Building2, 
  CheckCircle2, 
  Sliders, 
  X, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';

export default function CapacityCalculatorDashboard() {
  // Configurable Engineering Standards (can be modified by Xpredict team)
  const [config, setConfig] = useState({
    Hospital: {
      defaultLpcd: 350, // Liters per person per day (hospital beds + staff)
      wastewaterPercentage: 80, // 80% becomes wastewater
      treatmentType: 'Packaged MBBR / MBR Sewage Treatment Plant'
    },
    Apartment: {
      defaultLpcd: 135, // National CPHEEO residential norm
      wastewaterPercentage: 80, // 80% becomes wastewater
      treatmentType: 'Packaged SBR / MBBR Sewage Treatment Plant'
    },
    Industry: {
      defaultLpcd: 50, // Industrial worker / domestic norm
      wastewaterPercentage: 85, // 85% becomes industrial wastewater
      treatmentType: 'Effluent Treatment Plant (ETP) & Tertiary System'
    }
  });

  // 4 User Fields
  const [applicationType, setApplicationType] = useState('Apartment');
  const [occupants, setOccupants] = useState(250);
  const [waterUsage, setWaterUsage] = useState(135);
  const [operatingHours, setOperatingHours] = useState(16);

  // Results State
  const [results, setResults] = useState(null);

  // Settings Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [tempConfig, setTempConfig] = useState(config);

  // Update default LPCD when application type changes
  const handleApplicationTypeChange = (type) => {
    setApplicationType(type);
    if (config[type]) {
      setWaterUsage(config[type].defaultLpcd);
    }
  };

  // Standard commercial STP / ETP sizes in KLD
  const standardPlantSizes = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];

  const getRecommendedPlantCapacity = (rawKld) => {
    const rounded = standardPlantSizes.find(size => size >= rawKld);
    return rounded || Math.ceil(rawKld / 50) * 50;
  };

  // Calculate Handler
  const handleCalculate = (e) => {
    if (e) e.preventDefault();

    const currentAppConfig = config[applicationType] || config.Apartment;
    const numPeople = Number(occupants) || 0;
    const usagePerPerson = Number(waterUsage) || 0;
    const hours = Number(operatingHours) || 16;

    // 1. Daily Water Requirement (Liters/day and KLD)
    const dailyWaterLiters = numPeople * usagePerPerson;
    const dailyWaterKld = (dailyWaterLiters / 1000).toFixed(2);

    // 2. Estimated Wastewater (Predefined percentage)
    const wastewaterFactor = (currentAppConfig.wastewaterPercentage || 80) / 100;
    const estimatedWastewaterLiters = Math.round(dailyWaterLiters * wastewaterFactor);
    const estimatedWastewaterKld = (estimatedWastewaterLiters / 1000).toFixed(2);

    // 3. Required Treatment Capacity (Hourly Flow Rate)
    const requiredTreatmentCapacityLph = Math.ceil(estimatedWastewaterLiters / (hours || 1));
    const requiredTreatmentCapacityKldPerHour = (estimatedWastewaterLiters / (hours * 1000)).toFixed(2);

    // 4. Recommended Plant Capacity (Rounded to next standard commercial capacity)
    const recommendedKld = getRecommendedPlantCapacity(estimatedWastewaterLiters / 1000);
    const recommendedLph = Math.ceil((recommendedKld * 1000) / hours);

    setResults({
      dailyWaterRequirementLiters: dailyWaterLiters,
      dailyWaterRequirementKld: dailyWaterKld,
      estimatedWastewaterLiters: estimatedWastewaterLiters,
      estimatedWastewaterKld: estimatedWastewaterKld,
      requiredTreatmentCapacityLph: requiredTreatmentCapacityLph,
      requiredTreatmentCapacityKldPerHour: requiredTreatmentCapacityKldPerHour,
      recommendedPlantCapacityKld: recommendedKld,
      recommendedPlantCapacityLph: recommendedLph,
      plantType: currentAppConfig.treatmentType,
      wastewaterPercentage: currentAppConfig.wastewaterPercentage,
      occupants: numPeople,
      operatingHours: hours
    });
  };

  // Perform initial calculation on mount
  useEffect(() => {
    handleCalculate();
  }, [config]);

  // Save Config Changes
  const handleSaveConfig = () => {
    setConfig(tempConfig);
    setIsConfigModalOpen(false);
  };

  return (
    <div>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calculator size={20} style={{ color: 'var(--accent-color)' }} />
            Water & Wastewater Plant Capacity Calculator
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Calculates daily water demand, estimated wastewater, and recommended treatment plant capacity.
          </p>
        </div>

        {/* Configurable Engineering Standards Button */}
        <button 
          className="btn btn-secondary btn-small"
          onClick={() => { setTempConfig(config); setIsConfigModalOpen(true); }}
        >
          <Sliders size={14} /> Engineering Standards
        </button>
      </div>

      {/* Main 2-Column Grid */}
      <div className="calc-layout">
        
        {/* LEFT COLUMN: 4 FORM FIELDS */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.5rem', boxShadow: 'var(--shadow-card)', height: 'fit-content' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
            Input Site Parameters
          </h3>

          <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* 1. Application Type * */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                1. Application Type *
              </label>
              <select
                required
                className="form-control"
                value={applicationType}
                onChange={(e) => handleApplicationTypeChange(e.target.value)}
              >
                <option value="Apartment">Apartment / Residential Complex</option>
                <option value="Hospital">Hospital / Healthcare Facility</option>
                <option value="Industry">Industry / Commercial Factory</option>
              </select>
            </div>

            {/* 2. Number of People / Occupants * */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                2. Number of People / Occupants *
              </label>
              <input
                required
                type="number"
                min="1"
                step="1"
                className="form-control"
                placeholder="e.g. 250"
                value={occupants}
                onChange={(e) => setOccupants(e.target.value)}
              />
            </div>

            {/* 3. Water Usage per Person per Day * */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>
                  3. Water Usage per Person per Day *
                </label>
                <span style={{ fontSize: '0.78rem', color: 'var(--accent-color)', fontWeight: 600 }}>
                  Liters/Person/Day (LPCD)
                </span>
              </div>
              <input
                required
                type="number"
                min="10"
                step="5"
                className="form-control"
                placeholder="e.g. 135"
                value={waterUsage}
                onChange={(e) => setWaterUsage(e.target.value)}
              />
            </div>

            {/* 4. Operating Hours / Day * */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>
                  4. Operating Hours / Day *
                </label>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  (e.g. 12 to 24 hrs)
                </span>
              </div>
              <input
                required
                type="number"
                min="1"
                max="24"
                step="1"
                className="form-control"
                placeholder="e.g. 16"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
              />
            </div>

            {/* Calculate Button */}
            <button 
              type="submit" 
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', justifyContent: 'center', marginTop: '0.25rem' }}
            >
              <Calculator size={18} /> Calculate Capacity
            </button>

          </form>
        </div>

        {/* RIGHT COLUMN: 4 CALCULATED OUTPUTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          
          {results ? (
            <>
              {/* Outputs 1 & 2: Daily Water & Estimated Wastewater Side-by-Side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {/* Output 1: Daily Water Requirement */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.15rem', boxShadow: 'var(--shadow-card)' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Daily Water Requirement
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {results.dailyWaterRequirementLiters.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      LPD ({results.dailyWaterRequirementKld} KLD)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {results.occupants} occupants × {waterUsage} LPCD
                  </div>
                </div>

                {/* Output 2: Estimated Wastewater */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.15rem', boxShadow: 'var(--shadow-card)', borderLeft: '4px solid #F59E0B' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Estimated Wastewater
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#B45309' }}>
                      {results.estimatedWastewaterLiters.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      LPD ({results.estimatedWastewaterKld} KLD)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Predefined norm: {results.wastewaterPercentage}% of daily water
                  </div>
                </div>
              </div>

              {/* Output 3: Required Treatment Capacity */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--shadow-card)', borderLeft: '4px solid #3B82F6' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Required Treatment Capacity (Hourly Flow)
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1D4ED8' }}>
                    {results.requiredTreatmentCapacityLph.toLocaleString('en-IN')}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    LPH (Liters / Hour)
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Treating {results.estimatedWastewaterKld} KLD over {results.operatingHours} operating hours/day
                </div>
              </div>

              {/* Output 4: Recommended Plant Capacity */}
              <div style={{ background: 'var(--accent-dark)', color: '#FFFFFF', borderRadius: 'var(--radius-md)', padding: '1.5rem', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Recommended Plant Capacity
                  </span>
                  <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
                    Standard Commercial Size
                  </span>
                </div>

                <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#38BDF8', marginTop: '0.35rem', lineHeight: 1.2 }}>
                  {results.recommendedPlantCapacityKld} KLD
                  <span style={{ fontSize: '1.1rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginLeft: '0.5rem' }}>
                    ({(results.recommendedPlantCapacityKld * 1000).toLocaleString('en-IN')} Liters/Day)
                  </span>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                    Suggested Xpredict Solution
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#FFFFFF', marginTop: '0.2rem' }}>
                    {results.plantType}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Calculator size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Click "Calculate" to view results</div>
              <div style={{ fontSize: '0.85rem' }}>Calculates water demand, wastewater flow, and plant capacity.</div>
            </div>
          )}

        </div>

      </div>

      {/* CONFIGURABLE ENGINEERING STANDARDS MODAL */}
      {isConfigModalOpen && (
        <div className="modal-overlay" onClick={() => setIsConfigModalOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Configure Engineering Standards</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Customize Xpredict default LPCD and wastewater generation percentages
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsConfigModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Apartment Config */}
              <div style={{ background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  Apartment / Residential Complex
                </h4>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Default LPCD</label>
                    <input
                      type="number"
                      className="form-control"
                      value={tempConfig.Apartment.defaultLpcd}
                      onChange={(e) => setTempConfig({
                        ...tempConfig,
                        Apartment: { ...tempConfig.Apartment, defaultLpcd: Number(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Wastewater Generated (%)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={tempConfig.Apartment.wastewaterPercentage}
                      onChange={(e) => setTempConfig({
                        ...tempConfig,
                        Apartment: { ...tempConfig.Apartment, wastewaterPercentage: Number(e.target.value) }
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Hospital Config */}
              <div style={{ background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  Hospital / Healthcare Facility
                </h4>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Default LPCD</label>
                    <input
                      type="number"
                      className="form-control"
                      value={tempConfig.Hospital.defaultLpcd}
                      onChange={(e) => setTempConfig({
                        ...tempConfig,
                        Hospital: { ...tempConfig.Hospital, defaultLpcd: Number(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Wastewater Generated (%)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={tempConfig.Hospital.wastewaterPercentage}
                      onChange={(e) => setTempConfig({
                        ...tempConfig,
                        Hospital: { ...tempConfig.Hospital, wastewaterPercentage: Number(e.target.value) }
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Industry Config */}
              <div style={{ background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  Industry / Commercial Factory
                </h4>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Default LPCD</label>
                    <input
                      type="number"
                      className="form-control"
                      value={tempConfig.Industry.defaultLpcd}
                      onChange={(e) => setTempConfig({
                        ...tempConfig,
                        Industry: { ...tempConfig.Industry, defaultLpcd: Number(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Wastewater Generated (%)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={tempConfig.Industry.wastewaterPercentage}
                      onChange={(e) => setTempConfig({
                        ...tempConfig,
                        Industry: { ...tempConfig.Industry, wastewaterPercentage: Number(e.target.value) }
                      })}
                    />
                  </div>
                </div>
              </div>

            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsConfigModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveConfig}>
                Save Standards
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
