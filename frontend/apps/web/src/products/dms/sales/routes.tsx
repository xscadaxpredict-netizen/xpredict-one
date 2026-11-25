import { Route, Routes, Navigate } from "react-router-dom";
import { useShellContext } from "../../../shell/context";
import { EnquiryListScreen } from "./screens/EnquiryListScreen";
import { ConfirmedOrdersScreen } from "./screens/ConfirmedOrdersScreen";
import { QuotationsScreen } from "./screens/QuotationsScreen";
import { TechnoCommercialScreen } from "./screens/TechnoCommercialScreen";
import { CommissionsScreen } from "./screens/CommissionsScreen";
import { SalesLayout } from "./screens/SalesLayout";

/** Old bookmarks and links: the per-module dashboard now lives in Home -> Dashboard. */
function ToConsolidatedDashboard({ view }: { view: string }) {
  const { membership } = useShellContext();
  return <Navigate to={`/${membership.org_slug}/dms/home?view=${view}`} replace />;
}

export default function SalesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SalesLayout />}>
        <Route index element={<Navigate to="enquiries" replace />} />
        <Route path="dashboard" element={<ToConsolidatedDashboard view="sales" />} />
        <Route path="enquiries" element={<EnquiryListScreen />} />
        <Route path="orders" element={<ConfirmedOrdersScreen />} />
        <Route path="quotations" element={<QuotationsScreen />} />
        <Route path="techno-commercial" element={<TechnoCommercialScreen />} />
        <Route path="commissions" element={<CommissionsScreen />} />
        <Route path="*" element={<Navigate to="enquiries" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="enquiries" replace />} />
    </Routes>
  );
}
