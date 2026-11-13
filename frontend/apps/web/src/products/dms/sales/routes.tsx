import { Route, Routes, Navigate } from "react-router-dom";
import { SalesDashboardScreen } from "./screens/SalesDashboardScreen";
import { EnquiryListScreen } from "./screens/EnquiryListScreen";
import { ConfirmedOrdersScreen } from "./screens/ConfirmedOrdersScreen";
import { QuotationsScreen } from "./screens/QuotationsScreen";
import { TechnoCommercialScreen } from "./screens/TechnoCommercialScreen";
import { CommissionsScreen } from "./screens/CommissionsScreen";
import { SalesLayout } from "./screens/SalesLayout";

export default function SalesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SalesLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<SalesDashboardScreen />} />
        <Route path="enquiries" element={<EnquiryListScreen />} />
        <Route path="orders" element={<ConfirmedOrdersScreen />} />
        <Route path="quotations" element={<QuotationsScreen />} />
        <Route path="techno-commercial" element={<TechnoCommercialScreen />} />
        <Route path="commissions" element={<CommissionsScreen />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
