import { Route, Routes, Navigate } from "react-router-dom";
import { EcommerceLayout } from "./screens/EcommerceLayout";
import { EcommerceDashboardScreen } from "./screens/EcommerceDashboardScreen";
import { StoreCatalogScreen } from "./screens/StoreCatalogScreen";
import { MyOrdersScreen } from "./screens/MyOrdersScreen";

export default function EcommerceRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EcommerceLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<EcommerceDashboardScreen />} />
        <Route path="catalog" element={<StoreCatalogScreen />} />
        <Route path="orders" element={<MyOrdersScreen />} />
      </Route>
    </Routes>
  );
}
