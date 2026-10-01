import { useState } from "react";
import styles from "./TimerCalculationScreen.module.css";

export function TimerCalculationScreen() {
  const [formData, setFormData] = useState({
    wasteWaterType: "",
    site: "",
    capacity: "",
    electrodeType: "",
    ecsMinutes: "",
    ecsSeconds: "",
    ecPosMinutes: "",
    ecPosSeconds: "",
    ecPosDelay: "",
    ecNegMinutes: "",
    ecNegSeconds: "",
    ecNegDelay: "",
    sfpMinutes: "",
    sfpSeconds: "",
  });

  const [result, setResult] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    // Dummy calculation logic as requested by user
    setResult("Calculation Successful. Recommended total cycle time: 45 minutes.");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Timer Calculation</h2>
        <p className={styles.subtitle}>Calculate exact operational timers and delay sequences for treatment plants.</p>
      </div>

      <div className={styles.contentRow}>
        <div className={styles.formCard}>
          <form onSubmit={handleCalculate}>
            
            <div className={styles.sectionTitle}>General Details</div>
            <div className={styles.grid2}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Type of Waste Water</label>
                <select required className={styles.input} name="wasteWaterType" value={formData.wasteWaterType} onChange={handleChange}>
                  <option value="" disabled>Select waste water type...</option>
                  <option value="Sewage">Sewage</option>
                  <option value="Effluent">Effluent</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Site</label>
                <select required className={styles.input} name="site" value={formData.site} onChange={handleChange}>
                  <option value="" disabled>Select site...</option>
                  <option value="Site A">Site A</option>
                  <option value="Site B">Site B</option>
                  <option value="Site C">Site C</option>
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Capacity (KLD)</label>
                <input required type="number" className={styles.input} placeholder="e.g. 100" name="capacity" value={formData.capacity} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Electrode Type</label>
                <select required className={styles.input} name="electrodeType" value={formData.electrodeType} onChange={handleChange}>
                  <option value="" disabled>Select electrode type...</option>
                  <option value="Aluminum">Aluminum</option>
                  <option value="Iron">Iron</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionTitle}>ECS Timers</div>
            <div className={styles.grid3}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Minutes</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecsMinutes" value={formData.ecsMinutes} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Seconds</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecsSeconds" value={formData.ecsSeconds} onChange={handleChange} />
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionTitle}>EC Positive Timers</div>
            <div className={styles.grid3}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Minutes</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecPosMinutes" value={formData.ecPosMinutes} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Seconds</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecPosSeconds" value={formData.ecPosSeconds} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>On Delay (s)</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecPosDelay" value={formData.ecPosDelay} onChange={handleChange} />
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionTitle}>EC Negative Timers</div>
            <div className={styles.grid3}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Minutes</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecNegMinutes" value={formData.ecNegMinutes} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Seconds</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecNegSeconds" value={formData.ecNegSeconds} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>On Delay (s)</label>
                <input required type="number" className={styles.input} placeholder="0" name="ecNegDelay" value={formData.ecNegDelay} onChange={handleChange} />
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionTitle}>SFP Timers</div>
            <div className={styles.grid3}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Minutes</label>
                <input required type="number" className={styles.input} placeholder="0" name="sfpMinutes" value={formData.sfpMinutes} onChange={handleChange} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Seconds</label>
                <input required type="number" className={styles.input} placeholder="0" name="sfpSeconds" value={formData.sfpSeconds} onChange={handleChange} />
              </div>
            </div>

            <div style={{ marginTop: "2rem" }}>
              <button type="submit" className={styles.btnPrimary} style={{ width: "100%" }}>Calculate Parameters</button>
            </div>
          </form>
        </div>

        <div className={styles.resultsCard}>
          <div className={styles.sectionTitle} style={{ marginBottom: "1rem" }}>Results</div>
          {!result ? (
            <div className={styles.emptyState}>
              <p>Enter the parameters on the left and click calculate to see the exact timers.</p>
            </div>
          ) : (
            <div className={styles.resultBox}>
              <p>{result}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
