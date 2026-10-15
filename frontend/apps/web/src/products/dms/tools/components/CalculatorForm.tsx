import { ActivityIcon, Settings2Icon, BuildingIcon, UsersIcon } from 'lucide-react';
import type { ApplicationType } from '../api/capacityMath';
import styles from './CalculatorForm.module.css';

interface Props {
  input: any;
  onInputChange: (updates: any) => void;
  onCalculate: (e: React.FormEvent) => void;
  onReset: () => void;
}

export function CalculatorForm({ input, onInputChange, onCalculate, onReset }: Props) {
  const appType: ApplicationType = input.application || "Home/Appartments";

  const renderDynamicFields = () => {
    switch (appType) {
      case "Home/Appartments":
        return (
          <div className={styles.formGroup}>
            <label className={styles.label}><BuildingIcon size={14} /> Number of Houses</label>
            <input type="number" className={styles.input} required min="1" value={input.houses || ""} onChange={e => onInputChange({ houses: Number(e.target.value) })} />
          </div>
        );

      case "Schools":
        return (
          <div className={styles.formGroup}>
            <label className={styles.label}><UsersIcon size={14} /> Occupancy (Students + Staff)</label>
            <input type="number" className={styles.input} required min="1" value={input.occupancy || ""} onChange={e => onInputChange({ occupancy: Number(e.target.value) })} />
          </div>
        );

      case "Commercial":
      case "Restaurants":
      case "Offices":
      case "Public Toilet":
        return (
          <div className={styles.formGroup}>
            <label className={styles.label}><UsersIcon size={14} /> Daily Footfall</label>
            <input type="number" className={styles.input} required min="1" value={input.footfall || ""} onChange={e => onInputChange({ footfall: Number(e.target.value) })} />
          </div>
        );

      case "Hospital":
        return (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}><ActivityIcon size={14} /> Hospital Type</label>
              <select className={styles.select} value={input.hospitalType || "OPD"} onChange={e => onInputChange({ hospitalType: e.target.value })}>
                <option value="OPD">OPD</option>
                <option value="IPD">IPD</option>
              </select>
            </div>
            {input.hospitalType === "IPD" ? (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Number of Beds</label>
                  <input type="number" className={styles.input} required min="1" value={input.beds || ""} onChange={e => onInputChange({ beds: Number(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Additional Facilities (Optional)</label>
                  <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <label><input type="checkbox" checked={input.dialysis || false} onChange={e => onInputChange({ dialysis: e.target.checked })} /> Dialysis</label>
                    <label><input type="checkbox" checked={input.cancer || false} onChange={e => onInputChange({ cancer: e.target.checked })} /> Cancer</label>
                    <label><input type="checkbox" checked={input.surgeries || false} onChange={e => onInputChange({ surgeries: e.target.checked })} /> Surgeries</label>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.label}>Daily Footfall</label>
                <input type="number" className={styles.input} required min="1" value={input.footfall || ""} onChange={e => onInputChange({ footfall: Number(e.target.value) })} />
              </div>
            )}
          </>
        );

      case "Industries":
        return (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}><Settings2Icon size={14} /> Treatment Type</label>
              <select className={styles.select} value={input.industryType || "STP"} onChange={e => onInputChange({ industryType: e.target.value })}>
                <option value="STP">STP (Sewage)</option>
                <option value="ETP">ETP (Effluent)</option>
              </select>
            </div>
            {input.industryType === "STP" || !input.industryType ? (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Number of Employees</label>
                  <input type="number" className={styles.input} required min="1" value={input.employees || ""} onChange={e => onInputChange({ employees: Number(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label><input type="checkbox" checked={input.kitchen || false} onChange={e => onInputChange({ kitchen: e.target.checked })} /> Include Kitchen?</label>
                </div>
              </>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.label}>Water Consumed (Liters)</label>
                <input type="number" className={styles.input} required min="1" value={input.waterConsumed || ""} onChange={e => onInputChange({ waterConsumed: Number(e.target.value) })} />
              </div>
            )}
          </>
        );

      case "Resorts":
        return (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}><BuildingIcon size={14} /> Number of Rooms</label>
              <input type="number" className={styles.input} required min="1" value={input.rooms || ""} onChange={e => onInputChange({ rooms: Number(e.target.value) })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Additional Facilities (Optional)</label>
              <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                <label><input type="checkbox" checked={input.kitchen || false} onChange={e => onInputChange({ kitchen: e.target.checked })} /> Kitchen</label>
                <label><input type="checkbox" checked={input.pool || false} onChange={e => onInputChange({ pool: e.target.checked })} /> Swimming Pool</label>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.inputCard}>
      <h3 className={styles.sectionTitle}>Input Parameters</h3>
      <form onSubmit={onCalculate}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Application Type</label>
          <select 
            className={styles.select} 
            value={appType} 
            onChange={e => onInputChange({ 
              application: e.target.value,
              // reset specific fields when app type changes to avoid pollution
              houses: undefined, occupancy: undefined, footfall: undefined, 
              hospitalType: undefined, beds: undefined, dialysis: undefined, cancer: undefined, surgeries: undefined,
              industryType: undefined, employees: undefined, kitchen: undefined, waterConsumed: undefined, rooms: undefined, pool: undefined
            })}
          >
            <option value="Home/Appartments">Home / Appartments</option>
            <option value="Schools">Schools</option>
            <option value="Commercial">Commercial</option>
            <option value="Restaurants">Restaurants</option>
            <option value="Offices">Offices</option>
            <option value="Hospital">Hospital</option>
            <option value="Public Toilet">Public Toilet</option>
            <option value="Industries">Industries</option>
            <option value="Resorts">Resorts</option>
          </select>
        </div>

        <div className={styles.dynamicContainer}>
          {renderDynamicFields()}
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onReset}>Reset</button>
          <button type="submit" className={styles.btnPrimary}><ActivityIcon size={16} /> Calculate Capacity</button>
        </div>
      </form>
    </div>
  );
}
