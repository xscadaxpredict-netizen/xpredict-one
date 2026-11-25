import type { ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccess } from "../../../shell/access";
import { SalesDashboardScreen } from "../sales/screens/SalesDashboardScreen";
import { SiteServicesDashboardScreen } from "../site-services/screens/SiteServicesDashboardScreen";
import { EcommerceDashboardScreen } from "../ecommerce/screens/EcommerceDashboardScreen";
import styles from "./ConsolidatedDashboard.module.css";

/**
 * ONE DASHBOARD FOR DMS, in the Welcome Hub, instead of one per module.
 *
 * Each module's panel shows only if the person's role holds that module ---
 * `useAccess().hasModule`, the same rule that decides the sidebar links, so the
 * dashboard and the sidebar can never disagree about what somebody may see.
 * A panel that is not rendered never fetches, so a role without Sales makes no
 * Sales request at all rather than drawing an error box.
 *
 * As everywhere in the frontend, hiding is a courtesy: the backend refuses the
 * data regardless.
 *
 * The filter lives in the URL (`?view=sales`) so a filtered dashboard can be
 * bookmarked, and the old `<module>/dashboard` routes redirect here with it set.
 */

interface PanelConfig {
  /** The `?view=` value. */
  view: string;
  /** The module key the role must hold, as used by navigation.ts. */
  module: string;
  label: string;
  Panel: ComponentType;
}

const PANELS: PanelConfig[] = [
  { view: "sales", module: "sales", label: "Sales", Panel: SalesDashboardScreen },
  { view: "service", module: "service", label: "Site Services", Panel: SiteServicesDashboardScreen },
  { view: "ecommerce", module: "ecommerce", label: "E-Commerce", Panel: EcommerceDashboardScreen },
];

const ALL = "all";

export function ConsolidatedDashboard() {
  const access = useAccess();
  const [params, setParams] = useSearchParams();

  const visible = PANELS.filter((p) => access.hasModule(p.module));
  if (visible.length === 0) return null;

  // A view the role cannot see (a forwarded link, a changed role) falls back to
  // everything they CAN see, rather than an empty page that hints at the rest.
  const requested = params.get("view") ?? ALL;
  const active = visible.some((p) => p.view === requested) ? requested : ALL;
  const shown = active === ALL ? visible : visible.filter((p) => p.view === active);

  const choose = (view: string) => {
    const next = new URLSearchParams(params);
    if (view === ALL) next.delete("view");
    else next.set("view", view);
    setParams(next, { replace: true });
  };

  return (
    <section className={styles.section} aria-labelledby="dms-dashboard-title">
      <div className={styles.header}>
        {/* Read, not shown: Home's "Dashboard" tab already names it (2026-11-25). */}
        <h2 id="dms-dashboard-title" className={styles.visuallyHidden}>Dashboard</h2>
        {visible.length > 1 && (
          <div className={styles.filters} role="tablist" aria-label="Filter dashboard by module">
            {[{ view: ALL, label: "All" }, ...visible].map((f) => (
              <button
                key={f.view}
                type="button"
                role="tab"
                aria-selected={active === f.view}
                className={active === f.view ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                onClick={() => choose(f.view)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.map(({ view, label, Panel }) => (
        <div key={view} className={styles.panel} aria-label={`${label} dashboard`}>
          <Panel />
        </div>
      ))}
    </section>
  );
}
