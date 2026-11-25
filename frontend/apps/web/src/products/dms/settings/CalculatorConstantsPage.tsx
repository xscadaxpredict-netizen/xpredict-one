/**
 * DMS settings -> Masters -> CALCULATOR CONSTANTS, in the shared format (C78):
 * the page title, its two tabs, then the form, with Save beside the tabs.
 * One set of numbers for the whole organisation; every dealership's Capacity
 * and EC Dosing calculators read them.
 *
 * Was the last tab of "Load Master Data" (moved and restyled 2026-11-25). The
 * capacity form is rebuilt here from the same fields and the same save; the EC
 * Dosing tab is still `EcMasterSettingsTab` as it was (a large form of its own,
 * restyled separately if wanted). Tools -> Calculator Settings still shows the
 * old screen, `CalculatorSettingsScreen`.
 */

import { useEffect, useState } from "react";
import { listPageStyles as listStyles } from "@xpredict/ui";

import { useShellContext } from "../../../shell/context";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import { useTools } from "../tools/api/tools";
import type { EcConstants } from "../tools/api/ecDosingMath";
import { DEFAULT_CAPACITY_CONSTANTS } from "../tools/screens/CalculatorSettingsScreen";
import { EcMasterSettingsTab } from "../tools/screens/EcMasterSettingsTab";
import styles from "./Masters.module.css";

type Constants = typeof DEFAULT_CAPACITY_CONSTANTS;
type Key = keyof Constants;
type Tab = "capacity" | "ec";

/* The capacity form, card by card: the old screen's groups and labels. */
const GROUPS: { title: string; fields: { key: Key; label: string }[] }[] = [
  {
    title: "Homes / Apartments",
    fields: [
      { key: "home_avg_members", label: "Average members per house" },
      { key: "home_lts_pp", label: "Litres per person (LPD)" },
    ],
  },
  {
    title: "Schools & Commercial",
    fields: [
      { key: "school_lts_pp", label: "Schools (litres per person)" },
      { key: "commercial_lts_pp", label: "Commercial / offices (litres per person)" },
    ],
  },
  {
    title: "Hospitals",
    fields: [
      { key: "hosp_opd_lts", label: "OPD (litres per person)" },
      { key: "hosp_ipd_lts", label: "IPD (litres per bed)" },
      { key: "hosp_extra_lts", label: "Extra (dialysis / cancer)" },
    ],
  },
  {
    title: "Public Toilets",
    fields: [{ key: "toilet_lts_pp", label: "Toilets (litres per person)" }],
  },
  {
    title: "Industries & Resorts",
    fields: [
      { key: "stp_emp_lts", label: "STP base (litres per employee)" },
      { key: "stp_kitchen_lts", label: "STP kitchen (litres per employee)" },
      { key: "resort_lts_pp", label: "Resort base (litres per person)" },
      { key: "resort_persons_pr", label: "Resort persons per room" },
      { key: "resort_kitchen_lts", label: "Resort kitchen (litres per person)" },
      { key: "resort_pool_lts", label: "Resort pool (litres per person)" },
    ],
  },
];

export function CalculatorConstantsPage() {
  const { membership } = useShellContext();
  const { canConfigureCalculator } = useDmsPermissions();
  const { calculatorSettings, settingsPending, updateCalculatorSettings } = useTools(membership.org_slug);
  const [tab, setTab] = useState<Tab>("capacity");
  const [constants, setConstants] = useState<Constants>(DEFAULT_CAPACITY_CONSTANTS);
  const [feedback, setFeedback] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const saved = calculatorSettings?.constants as Partial<Constants> | undefined;

  useEffect(() => {
    if (saved && Object.keys(saved).length > 0) setConstants({ ...DEFAULT_CAPACITY_CONSTANTS, ...saved });
  }, [saved]);

  const save = (values: Constants, done: string) => {
    setFeedback(null);
    updateCalculatorSettings(
      { constants: values },
      {
        onSuccess: () => setFeedback({ text: done, kind: "ok" }),
        onError: () => setFeedback({ text: "The constants could not be saved.", kind: "error" }),
      },
    );
  };

  const saveEc = (data: EcConstants) => {
    setFeedback(null);
    updateCalculatorSettings(
      { ec_constants: data },
      {
        onSuccess: () => setFeedback({ text: "EC Dosing master data saved.", kind: "ok" }),
        onError: () => setFeedback({ text: "The EC Dosing master data could not be saved.", kind: "error" }),
      },
    );
  };

  return (
    <div className={listStyles.page}>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>Calculator Constants</h1>
      </div>

      <div className={listStyles.tabs} role="tablist" aria-label="Calculator constants">
        <button
          type="button"
          role="tab"
          id="constants-tab-capacity"
          aria-selected={tab === "capacity"}
          aria-controls="constants-panel"
          className={listStyles.tab}
          onClick={() => setTab("capacity")}
        >
          Capacity Calculator
        </button>
        <button
          type="button"
          role="tab"
          id="constants-tab-ec"
          aria-selected={tab === "ec"}
          aria-controls="constants-panel"
          className={listStyles.tab}
          onClick={() => setTab("ec")}
        >
          EC Dosing &amp; HRT
        </button>
      </div>

      {feedback && (
        <p className={styles.feedback} data-kind={feedback.kind} role={feedback.kind === "error" ? "alert" : "status"}>
          {feedback.text}
        </p>
      )}

      <div
        id="constants-panel"
        role="tabpanel"
        aria-labelledby={tab === "capacity" ? "constants-tab-capacity" : "constants-tab-ec"}
        className={styles.form}
      >
        {settingsPending ? (
          <p className={listStyles.empty}>Loading the constants…</p>
        ) : tab === "ec" ? (
          <EcMasterSettingsTab initialData={calculatorSettings?.ec_constants} onSave={saveEc} />
        ) : (
          <>
            {canConfigureCalculator && (
              <div className={listStyles.toolbar}>
                <span className={listStyles.spacer} />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setConstants({ ...DEFAULT_CAPACITY_CONSTANTS });
                    save({ ...DEFAULT_CAPACITY_CONSTANTS }, "The defaults are loaded and saved.");
                  }}
                >
                  Load defaults
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setConstants({ ...DEFAULT_CAPACITY_CONSTANTS, ...saved });
                    setFeedback({ text: "Changes discarded.", kind: "ok" });
                  }}
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  className={listStyles.primaryButton}
                  onClick={() => save(constants, "Capacity constants saved.")}
                >
                  Save
                </button>
              </div>
            )}

            {GROUPS.map((group) => (
              <section key={group.title} className={styles.card} aria-label={group.title}>
                <h2 className={styles.cardTitle}>{group.title}</h2>
                <div className={styles.fieldGrid}>
                  {group.fields.map((field) => (
                    <label key={field.key} className={styles.field}>
                      {field.label}
                      <input
                        type="number"
                        value={constants[field.key] || ""}
                        readOnly={!canConfigureCalculator}
                        onChange={(event) =>
                          setConstants((prev) => ({ ...prev, [field.key]: Number(event.target.value) }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
