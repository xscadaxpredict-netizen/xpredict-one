import { Outlet, Navigate, useLocation } from "react-router-dom";
import { ShoppingCartIcon, ListOrderedIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";

export function EcommerceLayout() {
  const location = useLocation();

  const tabs = [
    { id: "catalog", label: "Store Catalog", path: "catalog", icon: <ShoppingCartIcon size={16} /> },
    { id: "orders", label: "My Orders", path: "orders", icon: <ListOrderedIcon size={16} /> },
  ];

  if (location.pathname.endsWith("/ecommerce") || location.pathname.endsWith("/ecommerce/")) {
    return <Navigate to="catalog" replace />;
  }

  return (
    <div style={{ padding: "var(--space-6)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "0 0 var(--space-1) 0" }}>
          Spare Parts Store
        </h1>
        <p style={{ color: "var(--color-text-2)", fontSize: "var(--text-sm)", margin: 0 }}>
          Order replacement parts and consumables for deployed machines.
        </p>
      </div>
      <TabBar tabs={tabs} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
