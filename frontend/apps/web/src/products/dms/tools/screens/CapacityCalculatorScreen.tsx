import { useState } from "react";
import { FeasibilityForm as CalculatorForm } from "../components/FeasibilityForm";
import { FeasibilityResults as CalculatorResults } from "../components/FeasibilityResults";
import styles from "./CapacityCalculatorScreen.module.css";

const INITIAL_INPUT = {
  projectType: "Apartment",
  numberOfUnits: 100,
  personsPerUnit: 5,
  consumptionPerCapita: 135,
};

export function CapacityCalculatorScreen() {
  const [input, setInput] = useState(INITIAL_INPUT);
  const [result, setResult] = useState<any>(null);

  const calculateCapacity = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Total daily demand = Units * Persons/Unit * LPCD
    const totalDailyDemand = input.numberOfUnits * input.personsPerUnit * input.consumptionPerCapita;
    
    // STP capacity is usually 80-90% of total demand
    const stpCapacityLiters = totalDailyDemand * 0.85; 
    const stpCapacityKLD = Math.ceil(stpCapacityLiters / 1000);
    
    // WTP capacity equals total demand if 100% borewell
    const wtpCapacityKLD = Math.ceil(totalDailyDemand / 1000);

    let recommendedTechSTP = "SBR (Sequential Batch Reactor)";
    if (stpCapacityKLD < 50) recommendedTechSTP = "MBBR (Moving Bed Biofilm Reactor)";
    else if (stpCapacityKLD > 500) recommendedTechSTP = "MBR (Membrane Bioreactor)";

    let recommendedTechWTP = "Multi-Grade Sand Filter + Activated Carbon";
    if (wtpCapacityKLD > 100) recommendedTechWTP = "Fully Automatic RO + Softener System";

    setResult({
      totalDailyDemand,
      stpCapacity: stpCapacityKLD,
      wtpCapacity: wtpCapacityKLD,
      recommendedTechSTP,
      recommendedTechWTP,
    });
  };

  const resetForm = () => {
    setInput(INITIAL_INPUT);
    setResult(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Plant Capacity Calculator</h2>
        <p className={styles.subtitle}>Estimate Water Treatment Plant and Sewage Treatment Plant capacities for Apartments, Villas, and Commercial projects.</p>
      </div>

      <div className={styles.contentRow}>
        <div style={{ flex: 1 }}>
          <CalculatorForm 
            input={input}
            onInputChange={(updates) => setInput(prev => ({ ...prev, ...updates }))}
            onCalculate={calculateCapacity}
            onReset={resetForm}
          />
        </div>
        <div style={{ flex: 1 }}>
          <CalculatorResults result={result} />
        </div>
      </div>
    </div>
  );
}
