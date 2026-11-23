import { useState, useEffect } from "react";
import { PlusIcon, Trash2Icon, SaveIcon, InfoIcon, LayersIcon, DropletIcon, CpuIcon } from "lucide-react";
import {
  EcConstants,
  MachineConfig,
  MetalConfig,
  WaterTypeConfig,
  DEFAULT_MACHINES,
  DEFAULT_METALS,
  DEFAULT_WATER_TYPES,
  calculateTankVolume,
} from "../api/ecDosingMath";
import styles from "./EcMasterSettingsTab.module.css";

interface EcMasterSettingsTabProps {
  initialData?: EcConstants;
  onSave: (data: EcConstants) => void;
  isSaving?: boolean;
}

function sanitizeCustomParams(params?: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = { faraday_constant: 96485 };
  if (!params) return result;
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith("default_r_bench") && !k.startsWith("default_v0_bench")) {
      result[k] = v;
    }
  }
  return result;
}

export function EcMasterSettingsTab({
  initialData,
  onSave,
  isSaving = false,
}: EcMasterSettingsTabProps) {
  const [machines, setMachines] = useState<Record<string, MachineConfig>>(
    initialData?.machines || DEFAULT_MACHINES
  );
  const [metals, setMetals] = useState<Record<string, MetalConfig>>(
    initialData?.metals || DEFAULT_METALS
  );
  const [waterTypes, setWaterTypes] = useState<WaterTypeConfig[]>(
    initialData?.water_types?.length ? initialData.water_types : DEFAULT_WATER_TYPES
  );
  const [customParams, setCustomParams] = useState<Record<string, number>>(
    sanitizeCustomParams(initialData?.custom_parameters)
  );

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (initialData?.machines) setMachines(initialData.machines);
    if (initialData?.metals) setMetals(initialData.metals);
    if (initialData?.water_types?.length) setWaterTypes(initialData.water_types);
    if (initialData?.custom_parameters) {
      setCustomParams(sanitizeCustomParams(initialData.custom_parameters));
    }
  }, [initialData]);

  // Machine Handlers
  const handleMachineChange = (key: string, field: keyof MachineConfig, value: any) => {
    setMachines((prev) => {
      const current = prev[key];
      if (!current) return prev;
      const updated = { ...current, [field]: value };

      // Auto-recalculate volume if length, width, or depth changed
      if (field === "length_mm" || field === "width_mm" || field === "depth_mm") {
        const l = field === "length_mm" ? Number(value) : current.length_mm;
        const w = field === "width_mm" ? Number(value) : current.width_mm;
        const d = field === "depth_mm" ? Number(value) : current.depth_mm;
        updated.volume_m3 = calculateTankVolume(l, w, d);
      }

      setHasChanges(true);
      return { ...prev, [key]: updated };
    });
  };

  const handleAddMachine = () => {
    const id = `machine_${Date.now().toString().slice(-4)}`;
    const newMachine: MachineConfig = {
      key: id,
      name: "New Machine Model",
      capacity_kld: 10.0,
      length_mm: 1400,
      width_mm: 700,
      depth_mm: 900,
      volume_m3: calculateTankVolume(1400, 700, 900),
      plate_count: 6,
      plate_length_mm: 700,
      plate_height_mm: 350,
      plate_spacing_mm: 20,
      supply_voltage_max: 48.0,
      default_current_amps: 30.0,
    };
    setMachines((prev) => ({ ...prev, [id]: newMachine }));
    setHasChanges(true);
  };

  const handleDeleteMachine = (key: string) => {
    if (confirm(`Remove machine model "${machines[key]?.name || key}" from master data?`)) {
      setMachines((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      setHasChanges(true);
    }
  };

  // Metal Handlers
  const handleMetalChange = (key: string, field: keyof MetalConfig, value: any) => {
    setMetals((prev) => {
      const current = prev[key];
      if (!current) return prev;
      setHasChanges(true);
      return { ...prev, [key]: { ...current, [field]: value } };
    });
  };

  const handleAddMetal = () => {
    const nextNum = Object.keys(metals).length + 1;
    const key = `M${nextNum}`;
    setMetals((prev) => ({
      ...prev,
      [key]: { key, name: `New Metal ${nextNum}`, molar_mass: 55.0, valence_n: 2 },
    }));
    setHasChanges(true);
  };

  const handleMetalCodeChange = (oldKey: string, newCode: string) => {
    const formatted = newCode.toUpperCase().trim();
    if (!formatted || formatted === oldKey) return;
    setMetals((prev) => {
      const copy: Record<string, MetalConfig> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k === oldKey) {
          copy[formatted] = { ...v, key: formatted };
        } else {
          copy[k] = v;
        }
      }
      return copy;
    });
    setHasChanges(true);
  };

  const handleDeleteMetal = (key: string) => {
    if (confirm(`Remove metal "${metals[key]?.name || key}"?`)) {
      setMetals((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      setHasChanges(true);
    }
  };

  // Water Type Handlers
  const handleWaterTypeChange = (index: number, field: keyof WaterTypeConfig, value: any) => {
    setWaterTypes((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, [field]: value } as WaterTypeConfig;
      setHasChanges(true);
      return copy;
    });
  };

  const handleAddWaterType = () => {
    const newType: WaterTypeConfig = {
      id: `water_${Date.now().toString().slice(-4)}`,
      name: "New Wastewater Type",
      default_dose: 25.0,
      settling_time_min: 5,
    };
    setWaterTypes((prev) => [...prev, newType]);
    setHasChanges(true);
  };

  const handleDeleteWaterType = (index: number) => {
    setWaterTypes((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  // Custom Parameter Handlers
  const handleCustomParamChange = (key: string, value: number) => {
    setCustomParams((prev) => {
      setHasChanges(true);
      return { ...prev, [key]: value };
    });
  };

  const handleAddCustomParam = () => {
    const nextKey = `param_${Object.keys(customParams).length + 1}`;
    setCustomParams((prev) => ({ ...prev, [nextKey]: 1.0 }));
    setHasChanges(true);
  };

  const handleCustomParamKeyChange = (oldKey: string, newKey: string) => {
    const formatted = newKey.toLowerCase().replace(/\s+/g, "_").trim();
    if (!formatted || formatted === oldKey) return;
    setCustomParams((prev) => {
      const copy: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k === oldKey) {
          copy[formatted] = v;
        } else {
          copy[k] = v;
        }
      }
      return copy;
    });
    setHasChanges(true);
  };

  const handleDeleteCustomParam = (key: string) => {
    setCustomParams((prev) => {
      const copy = { ...prev };
      delete copy[key];
      setHasChanges(true);
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      machines,
      metals,
      water_types: waterTypes,
      custom_parameters: customParams,
    });
    setHasChanges(false);
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      {/* 1. Machine Lineup */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>
              <LayersIcon size={18} /> Machine Models & Tank Sizing
            </h3>
            <p className={styles.sectionSubtitle}>
              Define standard machine models (6 KLD, 25 KLD, 50 KLD), active chamber volumes, plate geometries, and power ceilings.
            </p>
          </div>
          <button type="button" className={styles.btnSecondary} onClick={handleAddMachine}>
            <PlusIcon size={16} /> Add Machine Model
          </button>
        </div>

        {Object.entries(machines).map(([key, machine]) => (
          <div key={key} className={styles.machineCard}>
            <div className={styles.machineCardHeader}>
              <input
                className={styles.machineNameInput}
                value={machine.name}
                onChange={(e) => handleMachineChange(key, "name", e.target.value)}
                placeholder="Machine Model Name"
                title="Click to edit name"
              />
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => handleDeleteMachine(key)}
                title="Delete machine model"
              >
                <Trash2Icon size={14} /> Remove
              </button>
            </div>

            <div className={styles.grid4} style={{ marginBottom: "var(--space-4)" }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Nominal Capacity (KLD)</label>
                <input
                  type="number"
                  step="0.1"
                  className={styles.input}
                  value={machine.capacity_kld || ""}
                  onChange={(e) => handleMachineChange(key, "capacity_kld", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Tank Length (mm)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={machine.length_mm || ""}
                  onChange={(e) => handleMachineChange(key, "length_mm", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Tank Width (mm)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={machine.width_mm || ""}
                  onChange={(e) => handleMachineChange(key, "width_mm", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Liquid Depth (mm)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={machine.depth_mm || ""}
                  onChange={(e) => handleMachineChange(key, "depth_mm", parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className={styles.grid4}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Active Volume (m³)</label>
                <input
                  type="number"
                  step="0.001"
                  className={`${styles.input} ${styles.readOnlyInput}`}
                  value={machine.volume_m3}
                  onChange={(e) => handleMachineChange(key, "volume_m3", parseFloat(e.target.value) || 0)}
                  title="Auto-calculated from L x W x Depth in meters, or override manually"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Plates Count (N)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={machine.plate_count || ""}
                  onChange={(e) => handleMachineChange(key, "plate_count", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Max Voltage Limit (V)</label>
                <input
                  type="number"
                  step="0.5"
                  className={styles.input}
                  value={machine.supply_voltage_max || ""}
                  onChange={(e) => handleMachineChange(key, "supply_voltage_max", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Default Current (A)</label>
                <input
                  type="number"
                  step="0.5"
                  className={styles.input}
                  value={machine.default_current_amps || ""}
                  onChange={(e) => handleMachineChange(key, "default_current_amps", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Metals Library */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>
              <CpuIcon size={18} /> Metal Specifications
            </h3>
            <p className={styles.sectionSubtitle}>
              Molar mass (g/mol) and valence electrons (n) used by Faraday's equation.
            </p>
          </div>
          <button type="button" className={styles.btnSecondary} onClick={handleAddMetal}>
            <PlusIcon size={16} /> Add Metal
          </button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Metal Name</th>
                <th>Molar Mass (g/mol)</th>
                <th>Valence Electrons (n)</th>
                <th style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metals).map(([key, metal]) => (
                <tr key={key}>
                  <td>
                    <input
                      className={styles.input}
                      style={{ width: "80px", fontWeight: 700, textTransform: "uppercase" }}
                      defaultValue={metal.key || key}
                      onBlur={(e) => handleMetalCodeChange(key, e.target.value)}
                      placeholder="e.g. AL"
                    />
                  </td>
                  <td>
                    <input
                      className={styles.input}
                      value={metal.name}
                      onChange={(e) => handleMetalChange(key, "name", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className={styles.input}
                      style={{ width: "120px" }}
                      value={metal.molar_mass}
                      onChange={(e) => handleMetalChange(key, "molar_mass", parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className={styles.input}
                      style={{ width: "80px" }}
                      value={metal.valence_n}
                      onChange={(e) => handleMetalChange(key, "valence_n", parseInt(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.deleteIconBtn}
                      onClick={() => handleDeleteMetal(key)}
                      title="Delete metal"
                    >
                      <Trash2Icon size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Wastewater Types Matrix */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>
              <DropletIcon size={18} /> Water Types & Recommended Dosages
            </h3>
            <p className={styles.sectionSubtitle}>
              Calibrated baseline dosing (mg/L) and settling times from R&D bench sweeps.
            </p>
          </div>
          <button type="button" className={styles.btnSecondary} onClick={handleAddWaterType}>
            <PlusIcon size={16} /> Add Water Type
          </button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Water Type Name</th>
                <th>Typical Dose (mg/L)</th>
                <th>Settling Time (min)</th>
                <th style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {waterTypes.map((type, idx) => (
                <tr key={type.id || idx}>
                  <td>
                    <input
                      className={styles.input}
                      value={type.name}
                      onChange={(e) => handleWaterTypeChange(idx, "name", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      className={styles.input}
                      style={{ width: "120px" }}
                      value={type.default_dose}
                      onChange={(e) => handleWaterTypeChange(idx, "default_dose", parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className={styles.input}
                      style={{ width: "100px" }}
                      value={type.settling_time_min}
                      onChange={(e) => handleWaterTypeChange(idx, "settling_time_min", parseInt(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.deleteIconBtn}
                      onClick={() => handleDeleteWaterType(idx)}
                      title="Delete water type"
                    >
                      <Trash2Icon size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Custom Key-Value Parameters */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>
              <InfoIcon size={18} /> Additional / Custom Engineering Parameters
            </h3>
            <p className={styles.sectionSubtitle}>
              Dynamic key-value parameters. Add custom coefficients without database migrations.
            </p>
          </div>
          <button type="button" className={styles.btnSecondary} onClick={handleAddCustomParam}>
            <PlusIcon size={16} /> Add Parameter
          </button>
        </div>

        {Object.entries(customParams).map(([k, val]) => (
          <div key={k} className={styles.paramRow}>
            <input
              className={styles.input}
              defaultValue={k}
              onBlur={(e) => handleCustomParamKeyChange(k, e.target.value)}
              placeholder="parameter_name"
              style={{ fontWeight: 600 }}
            />
            <input
              type="number"
              step="any"
              className={styles.input}
              value={val}
              onChange={(e) => handleCustomParamChange(k, parseFloat(e.target.value) || 0)}
              placeholder="Value"
            />
            <button
              type="button"
              className={styles.deleteIconBtn}
              onClick={() => handleDeleteCustomParam(k)}
              title="Delete parameter"
            >
              <Trash2Icon size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Sticky Save Bar */}
      <div className={styles.saveStickyBar}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-2)" }}>
          {hasChanges ? "⚠️ You have unsaved changes in master data." : "✓ Master data is synchronized."}
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
          <SaveIcon size={16} /> {isSaving ? "Saving Master Data..." : "Save All Master Data"}
        </button>
      </div>
    </form>
  );
}
