import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  ZapIcon,
  TimerIcon,
  FlaskConicalIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  SaveIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
  LayersIcon,
} from "lucide-react";
import { useTools } from "../api/tools";
import { useSites } from "../../site-services/hooks/useSiteServices";
import {
  DEFAULT_MACHINES,
  DEFAULT_METALS,
  DEFAULT_WATER_TYPES,
  FALLBACK_METAL,
  MetalConfig,
  calculateTankVolume,
  calculateDoseFromHrt,
  calculateHrtFromDose,
  calculateCurrentFromDoseAndHrt,
  checkVoltageFeasibility,
} from "../api/ecDosingMath";
import styles from "./ECDosingCalculatorScreen.module.css";

export function ECDosingCalculatorScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const {
    calculatorSettings,
    settingsPending,
    ecCalculations,
    createEcCalculation,
    deleteEcCalculation,
  } = useTools(orgSlug || "");

  const { data: sites = [] } = useSites();

  // Target Site selection
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [siteName, setSiteName] = useState<string>("");
  const [isCustomSite, setIsCustomSite] = useState<boolean>(false);

  // Master Constants (from server or fallback defaults)
  const machines = useMemo(() => {
    return calculatorSettings?.ec_constants?.machines || DEFAULT_MACHINES;
  }, [calculatorSettings]);

  const metals = useMemo(() => {
    return calculatorSettings?.ec_constants?.metals || DEFAULT_METALS;
  }, [calculatorSettings]);

  const waterTypes = useMemo(() => {
    return calculatorSettings?.ec_constants?.water_types?.length
      ? calculatorSettings.ec_constants.water_types
      : DEFAULT_WATER_TYPES;
  }, [calculatorSettings]);

  // Form State
  const [selectedMachineKey, setSelectedMachineKey] = useState<string>("6kld");
  const [customLengthMm, setCustomLengthMm] = useState<number>(1200);
  const [customWidthMm, setCustomWidthMm] = useState<number>(600);
  const [customDepthMm, setCustomDepthMm] = useState<number>(800);
  const [customMaxVoltage, setCustomMaxVoltage] = useState<number>(48.0);

  const [selectedMetalKey, setSelectedMetalKey] = useState<string>("AL");
  const [selectedWaterTypeId, setSelectedWaterTypeId] = useState<string>("");

  const [calculationMode, setCalculationMode] = useState<
    "TIME_FROM_DOSE" | "DOSE_FROM_TIME" | "CURRENT_FROM_DOSE"
  >("TIME_FROM_DOSE");

  const [appliedCurrentAmps, setAppliedCurrentAmps] = useState<number>(15.0);
  const [targetDoseMgL, setTargetDoseMgL] = useState<number>(25.0);
  const [treatmentTimeMinutes, setTreatmentTimeMinutes] = useState<number>(10.0);

  // Modal State for Saving
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync default current when machine changes
  useEffect(() => {
    if (selectedMachineKey !== "CUSTOM" && machines[selectedMachineKey]) {
      setAppliedCurrentAmps(machines[selectedMachineKey].default_current_amps || 20.0);
    }
  }, [selectedMachineKey, machines]);

  // Sync target dose when water type is selected
  const handleWaterTypeChange = (waterId: string) => {
    setSelectedWaterTypeId(waterId);
    if (waterId) {
      const match = waterTypes.find((w) => w.id === waterId);
      if (match) {
        setTargetDoseMgL(match.default_dose);
        if (match.settling_time_min) {
          setTreatmentTimeMinutes(match.settling_time_min);
        }
      }
    }
  };

  // Compute Active Tank Volume & Geometry
  const activeMachine = machines[selectedMachineKey];
  const activeVolumeM3 = useMemo(() => {
    if (selectedMachineKey === "CUSTOM") {
      return calculateTankVolume(customLengthMm, customWidthMm, customDepthMm);
    }
    return activeMachine?.volume_m3 || 0.400;
  }, [selectedMachineKey, activeMachine, customLengthMm, customWidthMm, customDepthMm]);

  const activePlateCount = selectedMachineKey === "CUSTOM" ? 4 : (activeMachine?.plate_count || 4);
  const activePlateLengthMm = selectedMachineKey === "CUSTOM" ? 600 : (activeMachine?.plate_length_mm || 500);
  const activePlateHeightMm = selectedMachineKey === "CUSTOM" ? 300 : (activeMachine?.plate_height_mm || 300);
  const activePlateSpacingMm = selectedMachineKey === "CUSTOM" ? 20 : (activeMachine?.plate_spacing_mm || 20);
  const activeSupplyVoltageMax = selectedMachineKey === "CUSTOM" ? customMaxVoltage : (activeMachine?.supply_voltage_max || 48.0);

  const activeMetal: MetalConfig = (metals && metals[selectedMetalKey]) ? metals[selectedMetalKey]! : FALLBACK_METAL;

  // Real-time Reactive Calculations
  const calculationResults = useMemo(() => {
    const molarMass = activeMetal.molar_mass || 27.0;
    const valenceN = activeMetal.valence_n || 3;

    let computedTimeMinutes = treatmentTimeMinutes;
    let computedTimeFormatted = "0 min 0 sec";
    let computedDoseMgL = targetDoseMgL;
    let computedCurrentAmps = appliedCurrentAmps;

    if (calculationMode === "TIME_FROM_DOSE") {
      const hrtRes = calculateHrtFromDose({
        targetDoseMgL,
        molarMass,
        valenceN,
        volumeM3: activeVolumeM3,
        currentAmps: appliedCurrentAmps,
      });
      computedTimeMinutes = hrtRes.timeMinutes;
      computedTimeFormatted = hrtRes.formatted;
    } else if (calculationMode === "DOSE_FROM_TIME") {
      computedDoseMgL = calculateDoseFromHrt({
        currentAmps: appliedCurrentAmps,
        molarMass,
        valenceN,
        volumeM3: activeVolumeM3,
        timeMinutes: treatmentTimeMinutes,
      });
    } else if (calculationMode === "CURRENT_FROM_DOSE") {
      computedCurrentAmps = calculateCurrentFromDoseAndHrt({
        targetDoseMgL,
        molarMass,
        valenceN,
        volumeM3: activeVolumeM3,
        timeMinutes: treatmentTimeMinutes,
      });
    }

    // Power Feasibility Check (using actual operating current)
    const currentToCheck = calculationMode === "CURRENT_FROM_DOSE" ? computedCurrentAmps : appliedCurrentAmps;
    const feasibility = checkVoltageFeasibility({
      currentAmps: currentToCheck,
      plateCount: activePlateCount,
      plateLengthMm: activePlateLengthMm,
      plateHeightMm: activePlateHeightMm,
      plateSpacingMm: activePlateSpacingMm,
      metalKey: selectedMetalKey,
      supplyVoltageMax: activeSupplyVoltageMax,
    });

    // Mass Dissolved per Batch and per Day
    const doseToUse = calculationMode === "DOSE_FROM_TIME" ? computedDoseMgL : targetDoseMgL;
    const dissolvedGramsPerBatch = Number((doseToUse * activeVolumeM3).toFixed(2));

    // Daily consumption assuming nominal machine capacity
    const nominalKld = activeMachine?.capacity_kld || (activeVolumeM3 * 24);
    const dailyMetalKg = Number(((doseToUse * nominalKld) / 1000).toFixed(3));

    return {
      computedTimeMinutes,
      computedTimeFormatted,
      computedDoseMgL,
      computedCurrentAmps,
      dissolvedGramsPerBatch,
      dailyMetalKg,
      feasibility,
      nominalKld,
    };
  }, [
    calculationMode,
    activeMetal,
    activeVolumeM3,
    appliedCurrentAmps,
    targetDoseMgL,
    treatmentTimeMinutes,
    activePlateCount,
    activePlateLengthMm,
    activePlateHeightMm,
    activePlateSpacingMm,
    selectedMetalKey,
    activeSupplyVoltageMax,
    activeMachine,
  ]);

  const handleSiteSelect = (val: string) => {
    if (val === "__custom__") {
      setIsCustomSite(true);
      setSelectedSiteId("");
    } else if (val) {
      setIsCustomSite(false);
      setSelectedSiteId(val);
      const matched = sites.find((s) => s.id === val);
      if (matched) {
        setSiteName(matched.site_name || matched.customer_name || "");
      }
    } else {
      setIsCustomSite(false);
      setSelectedSiteId("");
      setSiteName("");
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenSaveModal = () => {
    const machineLabel = selectedMachineKey === "CUSTOM" ? "Custom Tank" : machines[selectedMachineKey]?.name || selectedMachineKey;
    const prefix = siteName ? `${siteName} - ` : "";
    setSaveTitle(`${prefix}${machineLabel} ${activeMetal.name} (${calculationResults.computedDoseMgL} mg/L)`);
    setIsSaveModalOpen(true);
  };

  const handleConfirmSave = async () => {
    try {
      await createEcCalculation({
        title: saveTitle || "EC Calculation",
        site: selectedSiteId || null,
        site_name: siteName || null,
        calculation_mode: calculationMode,
        machine_model: selectedMachineKey,
        metal_type: selectedMetalKey,
        water_type: selectedWaterTypeId,
        input_params: {
          current_amps: appliedCurrentAmps,
          target_dose_mg_l: targetDoseMgL,
          treatment_time_minutes: treatmentTimeMinutes,
          volume_m3: activeVolumeM3,
          plate_count: activePlateCount,
        },
        output_params: {
          ...calculationResults,
        },
        notes: saveNotes,
      });
      setIsSaveModalOpen(false);
      showToast("Calculation saved successfully!");
    } catch (err) {
      alert("Failed to save calculation.");
    }
  };

  const handleDeleteCalculation = async (id: string) => {
    if (confirm("Delete this saved calculation?")) {
      try {
        await deleteEcCalculation(id);
        showToast("Deleted saved run.");
      } catch (err) {
        alert("Failed to delete calculation.");
      }
    }
  };

  const handleReset = () => {
    setSelectedMachineKey("6kld");
    setSelectedMetalKey("AL");
    setSelectedWaterTypeId("");
    setCalculationMode("TIME_FROM_DOSE");
    setAppliedCurrentAmps(machines["6kld"]?.default_current_amps || 15.0);
    setTargetDoseMgL(25.0);
    setTreatmentTimeMinutes(10.0);
  };

  if (settingsPending) {
    return <div style={{ padding: "3rem", textAlign: "center" }}>Loading Calculator Configuration...</div>;
  }

  return (
    <div className={styles.container}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          background: "var(--color-success)",
          color: "white",
          padding: "1rem 1.5rem",
          borderRadius: "8px",
          boxShadow: "var(--shadow-lg)",
          zIndex: 1100,
          fontWeight: 600,
        }}>
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Electrocoagulation (EC) Dosing & HRT Calculator</h1>
        <p className={styles.subtitle}>
          Faraday electrochemical equation engine with real-time power supply voltage and saturation checks.
        </p>
      </div>

      <div className={styles.mainLayout}>
        {/* Left Column: Inputs & Machine Controls */}
        <div className={styles.card}>
          {/* Target Installation Site / Customer */}
          <div style={{ marginBottom: "var(--space-4)", background: "var(--color-surface-alt, rgba(0,0,0,0.02))", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <label className={styles.fieldLabel} style={{ marginBottom: "var(--space-2)" }}>
              <span>Target Installation Site / Customer</span>
              <span className={styles.fieldHint}>Select confirmed site or enter prospective site</span>
            </label>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <select
                className={styles.select}
                style={{ flex: 1, minWidth: "240px" }}
                value={isCustomSite ? "__custom__" : selectedSiteId}
                onChange={(e) => handleSiteSelect(e.target.value)}
              >
                <option value="">-- General / Bench Evaluation (No Site) --</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    📍 {s.site_name || "Site"} — {s.customer_name} {s.oc_number ? `(OC: ${s.oc_number})` : ""}
                  </option>
                ))}
                <option value="__custom__">+ Enter Custom Site Name</option>
              </select>

              {(isCustomSite || (!selectedSiteId && siteName)) && (
                <input
                  type="text"
                  className={styles.input}
                  style={{ flex: 1, minWidth: "220px" }}
                  placeholder="Type site name (e.g. Phoenix Mall)..."
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Machine Selection */}
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label className={styles.fieldLabel}>
              <span>Machine Model / Tank Sizing</span>
              <span className={styles.fieldHint}>Pre-calibrated dimensions & volumes</span>
            </label>
            <div className={styles.pillGroup}>
              {Object.entries(machines).map(([key, m]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.pillBtn} ${selectedMachineKey === key ? styles.pillBtnActive : ""}`}
                  onClick={() => setSelectedMachineKey(key)}
                >
                  <LayersIcon size={14} /> {m.name || key.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.pillBtn} ${selectedMachineKey === "CUSTOM" ? styles.pillBtnActive : ""}`}
                onClick={() => setSelectedMachineKey("CUSTOM")}
              >
                + Custom Tank
              </button>
            </div>
          </div>

          {/* Custom Tank Dimensions (Shown only when Custom is chosen) */}
          {selectedMachineKey === "CUSTOM" && (
            <div style={{ background: "var(--color-canvas)", padding: "var(--space-4)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-text-2)", marginBottom: "var(--space-2)" }}>
                CUSTOM TANK DIMENSIONS
              </div>
              <div className={styles.grid3} style={{ marginBottom: "var(--space-3)" }}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Length (mm)</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={customLengthMm}
                    onChange={(e) => setCustomLengthMm(Number(e.target.value) || 0)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Width (mm)</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(Number(e.target.value) || 0)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Liquid Depth (mm)</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={customDepthMm}
                    onChange={(e) => setCustomDepthMm(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Max Voltage (V)</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={customMaxVoltage}
                    onChange={(e) => setCustomMaxVoltage(Number(e.target.value) || 48)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Computed Volume (m³)</label>
                  <input
                    readOnly
                    className={styles.input}
                    style={{ background: "var(--color-surface-alt)", fontWeight: 700, color: "var(--color-primary)" }}
                    value={`${activeVolumeM3} m³ (${(activeVolumeM3 * 1000).toLocaleString()} L)`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Metal Selection */}
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label className={styles.fieldLabel}>
              <span>Sacrificial Metal</span>
              <span className={styles.fieldHint}>Faraday molar mass (M) & valence (n)</span>
            </label>
            <div className={styles.pillGroup}>
              {Object.entries(metals).map(([key, metal]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.pillBtn} ${selectedMetalKey === key ? styles.pillBtnActive : ""}`}
                  onClick={() => setSelectedMetalKey(key)}
                >
                  <FlaskConicalIcon size={14} /> {metal.name} ({metal.molar_mass}g, n={metal.valence_n})
                </button>
              ))}
            </div>
          </div>

          {/* Wastewater Profile (Optional) */}
          <div className={styles.field} style={{ marginBottom: "var(--space-5)" }}>
            <label className={styles.fieldLabel}>
              <span>Wastewater Type (Optional)</span>
              <span className={styles.fieldHint}>Auto-sets calibrated bench dosage</span>
            </label>
            <select
              className={styles.select}
              value={selectedWaterTypeId}
              onChange={(e) => handleWaterTypeChange(e.target.value)}
            >
              <option value="">-- Manual Target Dosage --</option>
              {waterTypes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} (Typical: {w.default_dose} mg/L, {w.settling_time_min} min settling)
                </option>
              ))}
            </select>
          </div>

          {/* Calculation Mode Switcher */}
          <div style={{ marginBottom: "var(--space-2)" }}>
            <label className={styles.fieldLabel}>
              <span>Calculation Objective</span>
            </label>
            <div className={styles.modeTabs}>
              <button
                type="button"
                className={`${styles.modeTabBtn} ${calculationMode === "TIME_FROM_DOSE" ? styles.modeTabBtnActive : ""}`}
                onClick={() => setCalculationMode("TIME_FROM_DOSE")}
              >
                <TimerIcon size={14} /> Find Time / HRT
              </button>
              <button
                type="button"
                className={`${styles.modeTabBtn} ${calculationMode === "DOSE_FROM_TIME" ? styles.modeTabBtnActive : ""}`}
                onClick={() => setCalculationMode("DOSE_FROM_TIME")}
              >
                <FlaskConicalIcon size={14} /> Find Delivered Dose
              </button>
              <button
                type="button"
                className={`${styles.modeTabBtn} ${calculationMode === "CURRENT_FROM_DOSE" ? styles.modeTabBtnActive : ""}`}
                onClick={() => setCalculationMode("CURRENT_FROM_DOSE")}
              >
                <ZapIcon size={14} /> Find Required Current
              </button>
            </div>
          </div>

          {/* Dynamic Enterable Fields */}
          <div className={styles.fieldGroup}>
            {/* Current Input (Editable unless in CURRENT_FROM_DOSE mode) */}
            {calculationMode !== "CURRENT_FROM_DOSE" && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span>Applied Rectifier Current (Amperes, I)</span>
                  <span className={styles.fieldHint}>Operating cell current</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  className={styles.input}
                  value={appliedCurrentAmps}
                  onChange={(e) => setAppliedCurrentAmps(Math.max(0.1, parseFloat(e.target.value) || 0))}
                />
              </div>
            )}

            {/* Target Dose Input (Editable in TIME_FROM_DOSE and CURRENT_FROM_DOSE) */}
            {calculationMode !== "DOSE_FROM_TIME" && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span>Target Coagulant Dose (mg/L or ppm)</span>
                  <span className={styles.fieldHint}>Recommended range: 10 - 45 mg/L</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  className={styles.input}
                  value={targetDoseMgL}
                  onChange={(e) => setTargetDoseMgL(Math.max(0.1, parseFloat(e.target.value) || 0))}
                />
              </div>
            )}

            {/* Treatment Time Input (Editable in DOSE_FROM_TIME and CURRENT_FROM_DOSE) */}
            {calculationMode !== "TIME_FROM_DOSE" && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span>Treatment Contact Time / HRT (Minutes)</span>
                  <span className={styles.fieldHint}>Duration water remains in reactor</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  className={styles.input}
                  value={treatmentTimeMinutes}
                  onChange={(e) => setTreatmentTimeMinutes(Math.max(0.01, parseFloat(e.target.value) || 0))}
                />
              </div>
            )}
          </div>

          <div className={styles.actionRow}>
            <button type="button" className={styles.btnSecondary} onClick={handleReset}>
              <RotateCcwIcon size={16} /> Reset
            </button>
            <button type="button" className={styles.btnPrimary} onClick={handleOpenSaveModal}>
              <SaveIcon size={16} /> {siteName ? `Save Calculation for ${siteName}` : "Save Calculation"}
            </button>
          </div>
        </div>

        {/* Right Column: Reactive Engineering Results & Diagnostics */}
        <div className={styles.resultCard}>
          <div className={styles.heroMetric}>
            {calculationMode === "TIME_FROM_DOSE" && (
              <>
                <div className={styles.heroLabel}>Required Contact Time (HRT)</div>
                <div className={styles.heroValue}>{calculationResults.computedTimeFormatted}</div>
                <div className={styles.heroSubtitle}>
                  ({calculationResults.computedTimeMinutes} decimal minutes)
                </div>
              </>
            )}

            {calculationMode === "DOSE_FROM_TIME" && (
              <>
                <div className={styles.heroLabel}>Delivered Coagulant Dose</div>
                <div className={styles.heroValue}>{calculationResults.computedDoseMgL} mg/L</div>
                <div className={styles.heroSubtitle}>
                  (Delivered in {treatmentTimeMinutes} mins at {appliedCurrentAmps}A)
                </div>
              </>
            )}

            {calculationMode === "CURRENT_FROM_DOSE" && (
              <>
                <div className={styles.heroLabel}>Required Cell Current</div>
                <div className={styles.heroValue}>{calculationResults.computedCurrentAmps} A</div>
                <div className={styles.heroSubtitle}>
                  (To achieve {targetDoseMgL} mg/L in {treatmentTimeMinutes} mins)
                </div>
              </>
            )}
          </div>

          {/* Secondary Metrics */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricBox}>
              <div className={styles.metricBoxLabel}>Active Chamber Volume</div>
              <div className={styles.metricBoxValue}>
                {(activeVolumeM3 * 1000).toLocaleString()} L ({activeVolumeM3} m³)
              </div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricBoxLabel}>Metal Consumed / Batch</div>
              <div className={styles.metricBoxValue}>
                {calculationResults.dissolvedGramsPerBatch} g ({activeMetal.name.split(" ")[0]})
              </div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricBoxLabel}>Estimated Daily Metal</div>
              <div className={styles.metricBoxValue}>
                {calculationResults.dailyMetalKg} kg / day
              </div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricBoxLabel}>Operating Resistance</div>
              <div className={styles.metricBoxValue}>
                {calculationResults.feasibility.scaledResistanceOhms} Ω
              </div>
            </div>
          </div>

          {/* Power Supply & Saturation Feasibility Check */}
          <div
            className={`${styles.feasibilityBanner} ${
              calculationResults.feasibility.status === "FEASIBLE"
                ? styles.feasibleOk
                : calculationResults.feasibility.status === "MARGINAL"
                ? styles.feasibleMarginal
                : styles.feasibleExceeds
            }`}
          >
            {calculationResults.feasibility.status === "FEASIBLE" ? (
              <CheckCircle2Icon size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
            ) : (
              <AlertTriangleIcon size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
            )}
            <div>
              <strong>
                {calculationResults.feasibility.status === "FEASIBLE"
                  ? "Power Supply Feasible"
                  : calculationResults.feasibility.status === "MARGINAL"
                  ? "Near Voltage Ceiling"
                  : "Power Supply Voltage Warning"}
              </strong>
              <div style={{ marginTop: "4px" }}>
                {calculationResults.feasibility.message}
              </div>
              <div style={{ fontSize: "var(--text-xs)", marginTop: "4px", opacity: 0.9 }}>
                Required: {calculationResults.feasibility.voltageRequiredVolts}V | Limit: {activeSupplyVoltageMax}V
              </div>
            </div>
          </div>


        </div>
      </div>

      {/* Saved Calculations History */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0, color: "var(--color-text)" }}>
              Saved Site Calculations
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-2)", margin: 0 }}>
              Logged calculations saved during site evaluations and bench testing.
            </p>
          </div>
        </div>

        {ecCalculations?.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-3)", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border)" }}>
            No calculations saved yet. Run a calculation above and click "Save Calculation to Site".
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title / Site</th>
                  <th>Machine Model</th>
                  <th>Metal</th>
                  <th>Current (A)</th>
                  <th>Dose (mg/L)</th>
                  <th>Residence Time</th>
                  <th>Voltage Check</th>
                  <th>Saved Date</th>
                  <th style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {ecCalculations?.map((calc) => (
                  <tr key={calc.id}>
                    <td>
                      {calc.site_name ? (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>📍</span>
                            <strong style={{ color: "var(--color-primary)" }}>{calc.site_name}</strong>
                          </div>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-2)", marginTop: "2px" }}>
                            {calc.title}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <strong>{calc.title}</strong>
                        </div>
                      )}
                      {calc.notes && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-3)", marginTop: "2px" }}>
                          {calc.notes}
                        </div>
                      )}
                    </td>
                    <td>{calc.machine_model.toUpperCase()}</td>
                    <td>{calc.metal_type}</td>
                    <td>{calc.input_params?.current_amps || "-"} A</td>
                    <td>{calc.output_params?.computedDoseMgL || "-"} mg/L</td>
                    <td>{calc.output_params?.computedTimeFormatted || "-"}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: calc.output_params?.feasibility?.isFeasible ? "var(--color-success-100)" : "var(--color-danger-100)",
                          color: calc.output_params?.feasibility?.isFeasible ? "var(--color-success-700)" : "var(--color-danger-700)",
                        }}
                      >
                        {calc.output_params?.feasibility?.voltageRequiredVolts || "-"}V
                      </span>
                    </td>
                    <td style={{ fontSize: "var(--text-xs)", color: "var(--color-text-2)" }}>
                      {new Date(calc.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.deleteIconBtn}
                        onClick={() => handleDeleteCalculation(calc.id)}
                        title="Delete calculation"
                      >
                        <Trash2Icon size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Save Modal */}
      {isSaveModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Save Calculation</h3>
              <button
                type="button"
                className={styles.deleteIconBtn}
                onClick={() => setIsSaveModalOpen(false)}
              >
                <XIcon size={20} />
              </button>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Calculation Title / Site Label *</label>
              <input
                required
                className={styles.input}
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="e.g. Nishanth STP 25KLD Al Run"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Installation Site / Customer</label>
              <select
                className={styles.select}
                value={isCustomSite ? "__custom__" : selectedSiteId}
                onChange={(e) => handleSiteSelect(e.target.value)}
              >
                <option value="">-- General / Bench Evaluation (No Site) --</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    📍 {s.site_name || "Site"} — {s.customer_name} {s.oc_number ? `(OC: ${s.oc_number})` : ""}
                  </option>
                ))}
                <option value="__custom__">+ Enter Custom Site Name</option>
              </select>
            </div>

            {(isCustomSite || (!selectedSiteId && siteName)) && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Custom Site Name</label>
                <input
                  className={styles.input}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="e.g. Phoenix Mall, Prestige Tech Park"
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Operator Notes / Observations</label>
              <textarea
                className={styles.input}
                style={{ minHeight: "80px", resize: "vertical" }}
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="e.g. Sludge settled in 6 minutes with clear supernatant..."
              />
            </div>

            <div className={styles.actionRow} style={{ marginTop: "var(--space-2)" }}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setIsSaveModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleConfirmSave}
              >
                <SaveIcon size={16} /> Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
