import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BriefcaseIcon, CalculatorIcon, ZapIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";
import styles from "./ToolsLayout.module.css";

export function ToolsLayout() {
  const location = useLocation();

  const tabs = [
    { id: "marketing", label: "Marketing Kit", path: "marketing", icon: <BriefcaseIcon size={16} /> },
    { id: "calculator", label: "Capacity Calculator", path: "calculator", icon: <CalculatorIcon size={16} /> },
    { id: "ec-dosing", label: "EC Dosing & HRT", path: "ec-dosing", icon: <ZapIcon size={16} /> },
    { id: "feasibility", label: "Feasibility", path: "feasibility", icon: <BriefcaseIcon size={16} /> },
  ];

  if (location.pathname.endsWith("/tools") || location.pathname.endsWith("/tools/")) {
    return <Navigate to="marketing" replace />;
  }

  const isFeasibility = location.pathname.includes("/feasibility");

  return (
    <div className={styles.toolsLayoutContainer}>
      <div className={styles.tabBarWrapper}>
        <TabBar tabs={tabs} />
      </div>
      <div className={isFeasibility ? styles.feasibilityOutlet : styles.standardOutlet}>
        <Outlet />
      </div>
    </div>
  );
}
