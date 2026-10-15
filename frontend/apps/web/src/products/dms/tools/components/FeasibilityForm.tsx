
import styles from "./FeasibilityForm.module.css";

interface FeasibilityInput {
  projectType: string;
  numberOfUnits: number;
  personsPerUnit: number;
  consumptionPerCapita: number;
}

interface Props {
  input: FeasibilityInput;
  onInputChange: (updates: Partial<FeasibilityInput>) => void;
  onCalculate: (e: React.FormEvent) => void;
  onReset: () => void;
}

export function FeasibilityForm({ input, onInputChange, onCalculate, onReset }: Props) {
  return (
    <div className={styles.formCard}>
      <h3 className={styles.cardTitle}>Project Details</h3>
      <form onSubmit={onCalculate}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Project Type</label>
          <select 
            className={styles.input}
            value={input.projectType}
            onChange={(e) => onInputChange({ projectType: e.target.value })}
          >
            <option value="Apartment">Apartment Complex</option>
            <option value="Villa">Villa / Gated Community</option>
            <option value="Commercial">Commercial Building</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Number of Units (Flats/Villas)</label>
          <input 
            type="number"
            min="1"
            className={styles.input}
            value={input.numberOfUnits}
            onChange={(e) => onInputChange({ numberOfUnits: Number(e.target.value) })}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Average Persons per Unit</label>
          <input 
            type="number"
            min="1"
            className={styles.input}
            value={input.personsPerUnit}
            onChange={(e) => onInputChange({ personsPerUnit: Number(e.target.value) })}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Water Consumption (LPCD)</label>
          <input 
            type="number"
            min="1"
            className={styles.input}
            value={input.consumptionPerCapita}
            onChange={(e) => onInputChange({ consumptionPerCapita: Number(e.target.value) })}
          />
          <span className={styles.hint}>* Standard is 135 Liters Per Capita per Day</span>
        </div>

        <div className={styles.buttonGroup}>
          <button type="button" className={styles.btnSecondary} onClick={onReset}>
            Reset
          </button>
          <button type="submit" className={styles.btnPrimary}>
            Calculate Capacity
          </button>
        </div>
      </form>
    </div>
  );
}
