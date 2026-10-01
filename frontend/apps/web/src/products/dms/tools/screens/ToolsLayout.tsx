import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BriefcaseIcon, CalculatorIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";

export function ToolsLayout() {
  const location = useLocation();

  const tabs = [
    { id: "marketing", label: "Marketing Kit", path: "marketing", icon: <BriefcaseIcon size={16} /> },
    { id: "calculator", label: "Capacity Calculator", path: "calculator", icon: <CalculatorIcon size={16} /> },
    { id: "feasibility", label: "Feasibility", path: "feasibility", icon: <BriefcaseIcon size={16} /> },
  ];

  if (location.pathname.endsWith("/tools") || location.pathname.endsWith("/tools/")) {
    return <Navigate to="marketing" replace />;
  }

  return (
    <div style={{ padding: "var(--space-6)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "0 0 var(--space-1) 0" }}>
          Tools
        </h1>
        <p style={{ color: "var(--color-text-2)", fontSize: "var(--text-sm)", margin: 0 }}>
          Marketing assets, product brochures, video demonstrations, and water treatment plant capacity sizing.
        </p>
      </div>
      <TabBar tabs={tabs} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
