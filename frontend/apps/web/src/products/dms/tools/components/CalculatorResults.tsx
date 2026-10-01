import { LayersIcon, DatabaseIcon, ZapIcon, CheckCircleIcon } from "lucide-react";
import type { CapacityResult } from "../api/types";
import styles from "./CalculatorResults.module.css";

interface Props {
  result: CapacityResult | null;
}

export function CalculatorResults({ result }: Props) {
  if (!result) {
    return (
      <div className={styles.emptyCard}>
        <CheckCircleIcon size={32} style={{ margin: "0 auto 10px auto", opacity: 0.2 }} />
        <p>Enter parameters and click Calculate to view system sizing recommendations.</p>
      </div>
    );
  }

  return (
    <div className={styles.resultCard}>
      <h3 className={styles.sectionTitle} style={{ color: "white" }}>Recommended Configuration</h3>
      <div className={styles.resultGrid}>
        <div className={styles.statBox}>
          <div className={styles.statIcon}><LayersIcon size={20} /></div>
          <div className={styles.statValue}>{result.membraneCount}</div>
          <div className={styles.statLabel}>RO Membranes (8040)</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statIcon}><DatabaseIcon size={20} /></div>
          <div className={styles.statValue}>{result.vesselCount}</div>
          <div className={styles.statLabel}>FRP Vessels required</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statIcon}><ZapIcon size={20} /></div>
          <div className={styles.statValue}>{result.pumpPower}</div>
          <div className={styles.statLabel}>HPP Motor Power</div>
        </div>
      </div>
      <div className={styles.resultDetails}>
        <div className={styles.detailRow}><span>Estimated Recovery Rate</span><span className={styles.bold}>{result.recoveryRate}</span></div>
        <div className={styles.detailRow}><span>System Architecture</span><span className={styles.bold}>{result.systemType}</span></div>
      </div>
    </div>
  );
}
