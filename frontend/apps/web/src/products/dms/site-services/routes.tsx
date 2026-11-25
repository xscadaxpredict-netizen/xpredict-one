import { Route, Routes, Navigate } from "react-router-dom";
import { useShellContext } from "../../../shell/context";
import { SiteServicesLayout } from "./screens/SiteServicesLayout";
import { AMCScreen } from "./screens/AMCScreen";
import { SchedulingScreen } from "./screens/SchedulingScreen";
import { ServiceReportsScreen } from "./screens/ServiceReportsScreen";
import { WaterReportsScreen } from "./screens/WaterReportsScreen";

/** Old bookmarks and links: the per-module dashboard now lives in the Welcome Hub. */
function ToConsolidatedDashboard({ view }: { view: string }) {
  const { membership } = useShellContext();
  return <Navigate to={`/${membership.org_slug}/dms?view=${view}`} replace />;
}

/** Tickets moved to Installation & Tech Support; old links and bookmarks follow. */
function ToTickets() {
  const { membership } = useShellContext();
  return <Navigate to={`/${membership.org_slug}/dms/tech-support/tickets`} replace />;
}

export default function SiteServicesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SiteServicesLayout />}>
        <Route index element={<Navigate to="amc" replace />} />
        <Route path="dashboard" element={<ToConsolidatedDashboard view="service" />} />
        <Route path="amc" element={<AMCScreen />} />
        <Route path="scheduling" element={<SchedulingScreen />} />
        <Route path="reports" element={<ServiceReportsScreen />} />
        <Route path="water" element={<WaterReportsScreen />} />
        <Route path="complaints" element={<ToTickets />} />
      </Route>
    </Routes>
  );
}
