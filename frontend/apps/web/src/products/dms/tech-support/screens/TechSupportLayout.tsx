import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BookOpenIcon, PlaySquareIcon, PhoneCallIcon, AlertTriangleIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";
import styles from "../../shared/components/ModuleLayout.module.css";

export function TechSupportLayout() {
  const location = useLocation();

  const tabs = [
    { id: "manuals", label: "User Manuals", path: "manuals", icon: <BookOpenIcon size={16} /> },
    { id: "videos", label: "Machine Videos", path: "videos", icon: <PlaySquareIcon size={16} /> },
    { id: "calls", label: "Request for Call", path: "calls", icon: <PhoneCallIcon size={16} /> },
    { id: "tickets", label: "Raise Ticket", path: "tickets", icon: <AlertTriangleIcon size={16} /> },
  ];

  // If we are exactly on /tech-support, redirect to manuals tab
  if (location.pathname.endsWith("/tech-support") || location.pathname.endsWith("/tech-support/")) {
    return <Navigate to="manuals" replace />;
  }

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
