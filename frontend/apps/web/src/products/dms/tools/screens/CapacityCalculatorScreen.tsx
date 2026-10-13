import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CalculatorForm } from '../components/CalculatorForm';
import { calculateCapacity } from '../api/capacityMath';
import { useTools } from '../api/tools';
import styles from './CapacityCalculatorScreen.module.css';

const INITIAL_INPUT = {
  application: 'Home/Appartments',
};

export function CapacityCalculatorScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { calculatorSettings, settingsPending } = useTools(orgSlug || '');
  
  const [input, setInput] = useState<any>(INITIAL_INPUT);
  const [result, setResult] = useState<any>(null);

  const constants = useMemo(() => {
    return calculatorSettings?.constants || {};
  }, [calculatorSettings]);

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Perform calculation based on the dynamic formulas
    const { totalLiters, breakdown } = calculateCapacity(input.application, input, constants);
    
    // WTP capacity is simple daily demand in KLD
    const wtpCapacityKLD = Math.ceil(totalLiters / 1000);
    
    // STP capacity is usually 85% of total demand
    const stpCapacityLiters = totalLiters * 0.85; 
    const stpCapacityKLD = Math.ceil(stpCapacityLiters / 1000);

    let recommendedTechSTP = 'SBR (Sequential Batch Reactor)';
    if (stpCapacityKLD < 50) recommendedTechSTP = 'MBBR (Moving Bed Biofilm Reactor)';
    else if (stpCapacityKLD > 500) recommendedTechSTP = 'MBR (Membrane Bioreactor)';

    let recommendedTechWTP = 'Multi-Grade Sand Filter + Activated Carbon';
    if (wtpCapacityKLD > 100) recommendedTechWTP = 'Fully Automatic RO + Softener System';

    const output = {
      totalDailyDemand: totalLiters,
      breakdown,
      stpCapacity: stpCapacityKLD,
      wtpCapacity: wtpCapacityKLD,
      recommendedTechSTP,
      recommendedTechWTP,
    };

    setResult(output);
  };

  const handleReset = () => {
    setInput(INITIAL_INPUT);
    setResult(null);
  };

  if (settingsPending) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Calculator Master Data...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Plant Capacity Calculator</h2>
        <p className={styles.subtitle}>Dynamically estimate Water and Sewage Treatment capacities based on application type.</p>
      </div>

      <div className={styles.contentRow}>
        <div style={{ flex: 1 }}>
          <CalculatorForm 
            input={input}
            onInputChange={(updates) => setInput((prev: any) => ({ ...prev, ...updates }))}
            onCalculate={handleCalculate}
            onReset={handleReset}
          />
        </div>
        <div style={{ flex: 1 }}>
          {result ? (
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-2)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--color-text)' }}>Calculation Results</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-3)', borderRadius: '8px' }}>
                  <p style={{ color: 'var(--color-text-2)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Daily Demand</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-primary)' }}>{result.totalDailyDemand.toLocaleString()} Liters</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-3)', marginTop: '0.25rem' }}>{result.breakdown}</p>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-3)', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                    <p style={{ color: 'var(--color-text-2)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>WTP Capacity</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)' }}>{result.wtpCapacity} KLD</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-3)', marginTop: '0.5rem' }}>Tech: {result.recommendedTechWTP}</p>
                  </div>
                  
                  <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-3)', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                    <p style={{ color: 'var(--color-text-2)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>STP Capacity</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)' }}>{result.stpCapacity} KLD</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-3)', marginTop: '0.5rem' }}>Tech: {result.recommendedTechSTP}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', border: '1px dashed var(--color-border)', borderRadius: '12px', color: 'var(--color-text-3)' }}>
              Fill the form on the left to see results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
