import { Outlet, Navigate, useLocation } from "react-router-dom";
import { LayoutDashboardIcon, ShoppingCartIcon, ListOrderedIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";
import styles from "../../shared/components/ModuleLayout.module.css";

export function EcommerceLayout() {
  const location = useLocation();

  const tabs = [
    { id: "dashboard", label: "Dashboard", path: "dashboard", icon: <LayoutDashboardIcon size={16} /> },
    { id: "catalog", label: "Store Catalog", path: "catalog", icon: <ShoppingCartIcon size={16} /> },
    { id: "orders", label: "My Orders", path: "orders", icon: <ListOrderedIcon size={16} /> },
  ];

  if (location.pathname.endsWith("/ecommerce") || location.pathname.endsWith("/ecommerce/")) {
    return <Navigate to="dashboard" replace />;
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
