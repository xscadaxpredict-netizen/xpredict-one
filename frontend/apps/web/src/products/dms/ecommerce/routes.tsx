import { Route, Routes, Navigate } from "react-router-dom";
import { useShellContext } from "../../../shell/context";
import { EcommerceLayout } from "./screens/EcommerceLayout";
import { StoreCatalogScreen } from "./screens/StoreCatalogScreen";
import { MyOrdersScreen } from "./screens/MyOrdersScreen";

/** Old bookmarks and links: the per-module dashboard now lives in Home -> Dashboard. */
function ToConsolidatedDashboard({ view }: { view: string }) {
  const { membership } = useShellContext();
  return <Navigate to={`/${membership.org_slug}/dms/home?view=${view}`} replace />;
}

export default function EcommerceRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EcommerceLayout />}>
        <Route index element={<Navigate to="catalog" replace />} />
        <Route path="dashboard" element={<ToConsolidatedDashboard view="ecommerce" />} />
        <Route path="catalog" element={<StoreCatalogScreen />} />
        <Route path="orders" element={<MyOrdersScreen />} />
      </Route>
    </Routes>
  );
}
