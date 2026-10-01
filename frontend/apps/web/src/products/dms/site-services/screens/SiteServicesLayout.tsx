import { Outlet } from "react-router-dom";
import { CalendarIcon, FileTextIcon, DropletIcon, AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";

export function SiteServicesLayout() {
  const tabs = [
    { id: "amc", label: "AMC", path: "", icon: <ShieldCheckIcon size={16} /> },
    { id: "scheduled", label: "Scheduled Services", path: "scheduling", icon: <CalendarIcon size={16} /> },
    { id: "reports", label: "Service Reports", path: "reports", icon: <FileTextIcon size={16} /> },
    { id: "water", label: "Water Reports", path: "water", icon: <DropletIcon size={16} /> },
    { id: "complaints", label: "Complaint Box", path: "complaints", icon: <AlertTriangleIcon size={16} /> },
  ];

  return (
    <div style={{ padding: "var(--space-6)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "0 0 var(--space-1) 0" }}>
          Site Services
        </h1>
        <p style={{ color: "var(--color-text-2)", fontSize: "var(--text-sm)", margin: 0 }}>
          Manage deployed machines, schedule service visits, view reports, and track maintenance.
        </p>
      </div>

      <TabBar tabs={tabs} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
