import { Route, Routes } from "react-router-dom";
import { EnquiryListScreen } from "./screens/EnquiryListScreen";
import { ConfirmedOrdersScreen } from "./screens/ConfirmedOrdersScreen";
import { QuotationsScreen } from "./screens/QuotationsScreen";
import { SalesLayout } from "./screens/SalesLayout";
import { Navigate } from "react-router-dom";

export default function SalesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SalesLayout />}>
        <Route index element={<Navigate to="enquiries" replace />} />
        <Route path="enquiries" element={<EnquiryListScreen />} />
        <Route path="orders" element={<ConfirmedOrdersScreen />} />
        <Route path="quotations" element={<QuotationsScreen />} />
      </Route>
    </Routes>
  );
}
