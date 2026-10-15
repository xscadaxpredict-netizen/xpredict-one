import { Route, Routes, Navigate } from "react-router-dom";
import { SalesDashboardScreen } from "./screens/SalesDashboardScreen";
import { EnquiryListScreen } from "./screens/EnquiryListScreen";
import { ConfirmedOrdersScreen } from "./screens/ConfirmedOrdersScreen";
import { QuotationsScreen } from "./screens/QuotationsScreen";
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
      </Route>
    </Routes>
  );
}
