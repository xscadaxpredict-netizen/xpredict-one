import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CalculatorForm } from '../components/CalculatorForm';
import { calculateCapacity, matchStandardMachine, STANDARD_MACHINES_KLD } from '../api/capacityMath';
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
    
    // STP capacity is usually 85% of total demand
    const stpCapacityLiters = totalLiters * 0.85; 
    const stpCapacityKLD = Math.ceil(stpCapacityLiters / 1000);

    // Match to our standard product lineup (6 KLD, 25 KLD, 50 KLD)
    const standardMachine = matchStandardMachine(stpCapacityKLD);

    const output = {
      totalDailyDemand: totalLiters,
      breakdown,
      stpCapacityLiters,
      stpCapacity: stpCapacityKLD,
      standardMachine,
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
        <p className={styles.subtitle}>Dynamically estimate Sewage Treatment capacities and match with our standard machine lineup.</p>
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
                
                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-3)', borderRadius: '8px', borderLeft: '4px solid #2563eb' }}>
                  <p style={{ color: 'var(--color-text-2)', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Suggested Standard Machine</p>
                  <p style={{ fontSize: '1.45rem', fontWeight: 700, color: '#2563eb' }}>{result.standardMachine.label}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-3)', marginTop: '0.25rem' }}>
                    {result.standardMachine.description}
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-3)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-2)', marginBottom: '0.65rem' }}>
                    Standard Machine Lineup (6 KLD, 25 KLD, 50 KLD):
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {STANDARD_MACHINES_KLD.map((cap) => {
                      const isMatch = result.standardMachine.capacityKLD === cap;
                      const isUnder = cap < result.stpCapacity;
                      return (
                        <div
                          key={cap}
                          style={{
                            flex: 1,
                            minWidth: '100px',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: isMatch ? '2px solid #2563eb' : '1px solid var(--color-border)',
                            backgroundColor: isMatch ? 'rgba(37, 99, 235, 0.08)' : 'var(--color-surface)',
                            textAlign: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: isMatch ? '#1d4ed8' : 'var(--color-text)' }}>
                            {cap} KLD
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              marginTop: '4px',
                              fontWeight: isMatch ? 600 : 400,
                              color: isMatch ? '#2563eb' : isUnder ? 'var(--color-text-3)' : 'var(--color-text-2)',
                            }}
                          >
                            {isMatch ? '✓ Recommended' : isUnder ? 'Below Load' : 'Available'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-3)', marginTop: '0.75rem', fontStyle: 'italic' }}>
                    {result.standardMachine.description}
                  </p>
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
