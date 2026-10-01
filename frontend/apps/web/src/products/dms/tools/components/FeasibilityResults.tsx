import { CheckCircle2Icon, AlertTriangleIcon, InfoIcon } from "lucide-react";
import styles from "./FeasibilityResults.module.css";

interface FeasibilityResult {
  totalDailyDemand: number;
  stpCapacity: number;
  wtpCapacity: number;
  recommendedTechSTP: string;
  recommendedTechWTP: string;
}

interface Props {
  result: FeasibilityResult | null;
}

export function FeasibilityResults({ result }: Props) {
  if (!result) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}><InfoIcon size={32} /></div>
        <h3>No Calculation Yet</h3>
        <p>Enter the project details on the left and click calculate to see the recommended capacity.</p>
      </div>
    );
  }

  return (
    <div className={styles.resultCard}>
      <h3 className={styles.cardTitle}>Capacity Recommendations</h3>
      
      <div className={styles.resultGrid}>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Total Daily Water Demand</div>
          <div className={styles.statValue}>{result.totalDailyDemand.toLocaleString()} <span className={styles.unit}>Liters/Day</span></div>
          <div className={styles.statSub}>({(result.totalDailyDemand / 1000).toFixed(1)} KLD)</div>
        </div>

        <div className={styles.statBoxHighlight}>
          <div className={styles.statLabel}>Recommended STP Capacity</div>
          <div className={styles.statValue}>{result.stpCapacity.toLocaleString()} <span className={styles.unit}>KLD</span></div>
          <div className={styles.statSub}>~80-90% of total demand</div>
        </div>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Technology Recommendations</h4>
        
        <div className={styles.techRow}>
          <div className={styles.techIcon}><CheckCircle2Icon size={20} color="#10B981" /></div>
          <div className={styles.techInfo}>
            <div className={styles.techName}>STP: {result.recommendedTechSTP}</div>
            <div className={styles.techDesc}>Ideal for {result.stpCapacity} KLD capacity with optimal footprint and efficiency.</div>
          </div>
        </div>

        <div className={styles.techRow}>
          <div className={styles.techIcon}><CheckCircle2Icon size={20} color="#10B981" /></div>
          <div className={styles.techInfo}>
            <div className={styles.techName}>WTP: {result.recommendedTechWTP}</div>
            <div className={styles.techDesc}>Required capacity: {result.wtpCapacity} KLD (Based on 100% borewell/tanker dependence).</div>
          </div>
        </div>
      </div>

      <div className={styles.disclaimer}>
        <AlertTriangleIcon size={16} />
        <div>
          <strong>Disclaimer:</strong> This is an estimated feasibility calculation. Actual requirements may vary based on peak flow factors, local regulations, and specific water quality reports.
        </div>
      </div>
    </div>
  );
}
