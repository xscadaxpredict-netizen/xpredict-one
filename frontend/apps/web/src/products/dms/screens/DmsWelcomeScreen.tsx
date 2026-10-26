import { Link } from "react-router-dom";
import {
  TrendingUp,
  Wrench,
  Headphones,
  ShoppingCart,
  Calculator,
  Settings2,
  ArrowRight,
  Sparkles,
  Layers,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { useShellContext } from "../../../shell/context";
import styles from "./DmsWelcomeScreen.module.css";

interface ModuleCardConfig {
  id: string;
  title: string;
  description: string;
  icon: typeof TrendingUp;
  iconBg: string;
  primaryPath: string;
  primaryActionLabel: string;
  screens: Array<{ label: string; path: string }>;
}

export function DmsWelcomeScreen() {
  const { membership } = useShellContext();
  const basePath = `/${membership.org_slug}/dms`;

  const modules: ModuleCardConfig[] = [
    {
      id: "sales",
      title: "Sales Management",
      description:
        "Commercial workflow from initial lead capture and RFQs to quotation generation, margin calculations, and confirmed sales orders.",
      icon: TrendingUp,
      iconBg: "linear-gradient(135deg, #2563eb, #1d4ed8)",
      primaryPath: `${basePath}/sales/dashboard`,
      primaryActionLabel: "Open Sales Dashboard",
      screens: [
        { label: "Sales Dashboard", path: `${basePath}/sales/dashboard` },
        { label: "Enquiries & Leads", path: `${basePath}/sales/enquiries` },
        { label: "Confirmed Orders", path: `${basePath}/sales/orders` },
        { label: "Quotations", path: `${basePath}/sales/quotations` },
      ],
    },
    {
      id: "site-services",
      title: "Site Services & Scheduling",
      description:
        "Complete after-sales operations: Annual Maintenance Contracts (AMC), scheduled engineer visits, water quality test reports, and customer complaint tracking.",
      icon: Wrench,
      iconBg: "linear-gradient(135deg, #059669, #047857)",
      primaryPath: `${basePath}/site-services/dashboard`,
      primaryActionLabel: "Open Services Hub",
      screens: [
        { label: "Service Dashboard", path: `${basePath}/site-services/dashboard` },
        { label: "AMC Contracts", path: `${basePath}/site-services/amc` },
        { label: "Scheduled Services", path: `${basePath}/site-services/scheduling` },
        { label: "Service Reports", path: `${basePath}/site-services/reports` },
        { label: "Water Reports", path: `${basePath}/site-services/water` },
        { label: "Complaint Box", path: `${basePath}/site-services/complaints` },
      ],
    },
    {
      id: "tech-support",
      title: "Installation & Tech Support",
      description:
        "Field enablement resources: interactive equipment manuals, instructional video library, on-demand callback requests, and timer calibration calculators.",
      icon: Headphones,
      iconBg: "linear-gradient(135deg, #7c3aed, #6d28d9)",
      primaryPath: `${basePath}/tech-support/manuals`,
      primaryActionLabel: "View Support & Manuals",
      screens: [
        { label: "User Manuals", path: `${basePath}/tech-support/manuals` },
        { label: "Machine Videos", path: `${basePath}/tech-support/videos` },
        { label: "Request for Call", path: `${basePath}/tech-support/calls` },
        { label: "Timer Calculation", path: `${basePath}/tech-support/timer-calculation` },
      ],
    },
    {
      id: "ecommerce",
      title: "E-Commerce & Spare Parts",
      description:
        "Direct procurement store for OEM spare parts, consumable supplies, accessories, and automated order fulfillment tracking.",
      icon: ShoppingCart,
      iconBg: "linear-gradient(135deg, #d97706, #b45309)",
      primaryPath: `${basePath}/ecommerce/dashboard`,
      primaryActionLabel: "Go to Parts Store",
      screens: [
        { label: "Store Dashboard", path: `${basePath}/ecommerce/dashboard` },
        { label: "Store Catalog", path: `${basePath}/ecommerce/catalog` },
        { label: "My Orders", path: `${basePath}/ecommerce/orders` },
      ],
    },
    {
      id: "tools",
      title: "Engineering Tools & Calculators",
      description:
        "Technical sizing utilities: plant capacity calculators, site feasibility evaluation forms, and marketing collateral repository.",
      icon: Calculator,
      iconBg: "linear-gradient(135deg, #0891b2, #0e7490)",
      primaryPath: `${basePath}/tools/calculator`,
      primaryActionLabel: "Open Calculators",
      screens: [
        { label: "Capacity Calculator", path: `${basePath}/tools/calculator` },
        { label: "Site Feasibility", path: `${basePath}/tools/feasibility` },
        { label: "Marketing Kit", path: `${basePath}/tools/marketing` },
      ],
    },
    {
      id: "configuration",
      title: "Master Configuration",
      description:
        "Central repository for bulk master data loading, product SKUs, pricing baselines, and organization-wide operational parameters.",
      icon: Settings2,
      iconBg: "linear-gradient(135deg, #475569, #334155)",
      primaryPath: `${basePath}/settings`,
      primaryActionLabel: "Configure Master Data",
      screens: [
        { label: "Load Master Data", path: `${basePath}/settings` },
      ],
    },
  ];

  const lifecycleStages = [
    {
      number: "Stage 01",
      name: "Enquiries & Sales",
      detail: "Lead intake, quote generation, and sales pipeline tracking.",
    },
    {
      number: "Stage 02",
      name: "Feasibility & Sizing",
      detail: "Capacity calculations and site compatibility assessments.",
    },
    {
      number: "Stage 03",
      name: "Orders & Production",
      detail: "Confirmed purchase orders, timer specifications & machine parameters.",
    },
    {
      number: "Stage 04",
      name: "Installation & Setup",
      detail: "Instructional videos, user manuals, and commissioning handover.",
    },
    {
      number: "Stage 05",
      name: "Service & Maintenance",
      detail: "Recurring AMC visits, water test logs, and field reports.",
    },
    {
      number: "Stage 06",
      name: "Parts & Support",
      detail: "Genuine spares ordering, call requests, and complaint resolution.",
    },
  ];

  return (
    <div className={styles.container}>
      {/* Hero Welcome Banner */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.pulseDot} />
            <Sparkles size={13} />
            <span>Dealership Operations Hub · {membership.org_name}</span>
          </div>

          <h1 className={styles.heroTitle}>
            Welcome to Dealer Management (DMS)
          </h1>

          <p className={styles.heroSubtitle}>
            Your unified operations platform handling everything from sales and production
            to ongoing maintenance, engineering calculations, and spare parts procurement.
            All tools and workflows are ready for use.
          </p>


        </div>
      </section>

      {/* End-to-End Lifecycle Journey */}
      <section className={styles.lifecycleSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <Layers size={20} color="var(--color-primary)" />
            End-to-End Dealership Ecosystem
          </h2>
          <p className={styles.sectionDescription}>
            How Xpredict DMS powers your organization across the complete machinery and client lifecycle:
          </p>
        </div>

        <div className={styles.flowGrid}>
          {lifecycleStages.map((stage) => (
            <div key={stage.number} className={styles.flowStep}>
              <span className={stage.number.includes("01") ? styles.stepNumber : styles.stepNumber}>
                {stage.number}
              </span>
              <h3 className={stage.name ? styles.stepName : styles.stepName}>{stage.name}</h3>
              <p className={styles.stepDetail}>{stage.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules Grid */}
      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <Compass size={20} color="var(--color-primary)" />
            Available Modules & Workflows
          </h2>
          <p className={styles.sectionDescription}>
            Select any module to start managing your daily operations:
          </p>
        </div>

        <div className={styles.modulesGrid}>
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div key={mod.id} className={styles.moduleCard}>
                <div className={styles.cardTop}>
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.iconBox} style={{ background: mod.iconBg }}>
                      <Icon size={22} />
                    </div>
                    <span className={styles.statusPill}>
                      <span className={styles.statusDot} />
                      Active & Ready
                    </span>
                  </div>

                  <div>
                    <h3 className={styles.cardTitle}>{mod.title}</h3>
                    <p className={styles.cardDesc}>{mod.description}</p>
                  </div>

                  <div>
                    <div className={styles.quickLinksTitle}>Quick Access Screens</div>
                    <ul className={styles.linksList}>
                      {mod.screens.map((screen) => (
                        <li key={screen.path}>
                          <Link to={screen.path} className={styles.screenLink}>
                            <span>{screen.label}</span>
                            <ArrowRight size={10} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <Link to={mod.primaryPath} className={styles.openModuleBtn}>
                    <span>{mod.primaryActionLabel}</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Highlights Banner */}
      <footer className={styles.valueBanner}>
        <div className={styles.valueText}>
          <div className={styles.valueTitle}>
            <ShieldCheck size={18} color="var(--color-primary)" style={{ verticalAlign: "middle", marginRight: 6 }} />
            Enterprise Multi-Tenant Architecture
          </div>
          <p className={styles.valueSubtitle}>
            All modules operate in real-time isolation for <strong>{membership.org_name}</strong>.
            Data, reports, quotes, and service histories remain secure, traceable, and available anytime.
          </p>
        </div>

        <div className={styles.metricsRow}>
          <div className={styles.metricBox}>
            <span className={styles.metricValue}>6</span>
            <span className={styles.metricLabel}>Core Modules</span>
          </div>
          <div className={styles.metricBox}>
            <span className={styles.metricValue}>100%</span>
            <span className={styles.metricLabel}>Process Coverage</span>
          </div>
          <div className={styles.metricBox}>
            <span className={styles.metricValue}>24/7</span>
            <span className={styles.metricLabel}>Support Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default DmsWelcomeScreen;
