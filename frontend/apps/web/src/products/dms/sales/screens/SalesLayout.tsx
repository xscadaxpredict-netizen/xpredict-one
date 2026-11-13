import { Outlet } from "react-router-dom";
import { LayoutDashboardIcon, TagIcon, CheckSquareIcon, FileTextIcon, FileCheckIcon, BanknoteIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";
import styles from "../../shared/components/ModuleLayout.module.css";

export function SalesLayout() {
  const tabs = [
    { id: "dashboard", label: "Dashboard", path: "dashboard", icon: <LayoutDashboardIcon size={16} /> },
    { id: "enquiries", label: "Enquiries", path: "enquiries", icon: <TagIcon size={16} /> },
    { id: "orders", label: "Confirmed Orders", path: "orders", icon: <CheckSquareIcon size={16} /> },
    { id: "quotations", label: "Quotations", path: "quotations", icon: <FileTextIcon size={16} /> },
    { id: "techno-commercial", label: "Techno-Commercial", path: "techno-commercial", icon: <FileCheckIcon size={16} /> },
    { id: "commissions", label: "Commissions", path: "commissions", icon: <BanknoteIcon size={16} /> },
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
