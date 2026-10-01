import { DropletIcon, ActivityIcon, ThermometerIcon, FilterIcon } from "lucide-react";
import type { CapacityInput } from "../api/types";
import styles from "./CalculatorForm.module.css";

interface Props {
  input: CapacityInput;
  onInputChange: (updates: Partial<CapacityInput>) => void;
  onCalculate: (e: React.FormEvent) => void;
  onReset: () => void;
}

export function CalculatorForm({ input, onInputChange, onCalculate, onReset }: Props) {
  return (
    <div className={styles.inputCard}>
      <h3 className={styles.sectionTitle}>Input Parameters</h3>
      <form onSubmit={onCalculate}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Application Type</label>
          <select className={styles.select} value={input.application} onChange={e => onInputChange({ application: e.target.value })}>
            <option value="Industrial RO">Industrial Reverse Osmosis</option>
            <option value="Commercial RO">Commercial RO</option>
            <option value="Brackish Water">Brackish Water Treatment</option>
            <option value="Sea Water">Sea Water Desalination (SWRO)</option>
          </select>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label}><DropletIcon size={14} /> Required Flow Rate (LPH)</label>
            <input type="number" className={styles.input} required min="100" max="100000" value={input.flowRate || ""} onChange={e => onInputChange({ flowRate: Number(e.target.value) })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}><FilterIcon size={14} /> Feed Water TDS (ppm)</label>
            <input type="number" className={styles.input} required min="50" max="45000" value={input.tds || ""} onChange={e => onInputChange({ tds: Number(e.target.value) })} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}><ThermometerIcon size={14} /> Temperature (°C)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <input type="range" min="5" max="45" value={input.temperature} onChange={e => onInputChange({ temperature: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, width: "40px" }}>{input.temperature}°C</span>
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onReset}>Reset</button>
          <button type="submit" className={styles.btnPrimary}><ActivityIcon size={16} /> Calculate Capacity</button>
        </div>
      </form>
    </div>
  );
}
