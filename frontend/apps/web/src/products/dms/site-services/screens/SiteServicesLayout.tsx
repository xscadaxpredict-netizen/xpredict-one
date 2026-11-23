import { Outlet } from "react-router-dom";
import { CalendarIcon, FileTextIcon, DropletIcon, AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";
import styles from "../../shared/components/ModuleLayout.module.css";

export function SiteServicesLayout() {
  const tabs = [
    { id: "amc", label: "AMC", path: "amc", icon: <ShieldCheckIcon size={16} /> },
    { id: "scheduled", label: "Scheduled Services", path: "scheduling", icon: <CalendarIcon size={16} /> },
    { id: "reports", label: "Service Reports", path: "reports", icon: <FileTextIcon size={16} /> },
    { id: "water", label: "Water Reports", path: "water", icon: <DropletIcon size={16} /> },
    { id: "complaints", label: "Complaint Box", path: "complaints", icon: <AlertTriangleIcon size={16} /> },
  ];

  return (
    <div className={styles.moduleLayoutContainer}>
      <div className={styles.tabBarWrapper}>
        <TabBar tabs={tabs} />
      </div>
      <div className={styles.outletContainer}>
        <Outlet />
      </div>
    </div>
  );
}
