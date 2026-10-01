import { Route, Routes } from "react-router-dom";
import { SiteServicesLayout } from "./screens/SiteServicesLayout";
import { AMCScreen } from "./screens/AMCScreen";
import { SchedulingScreen } from "./screens/SchedulingScreen";
import { ServiceReportsScreen } from "./screens/ServiceReportsScreen";
import { WaterReportsScreen } from "./screens/WaterReportsScreen";
import { ComplaintsScreen } from "./screens/ComplaintsScreen";

export default function SiteServicesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SiteServicesLayout />}>
        <Route index element={<AMCScreen />} />
        <Route path="scheduling" element={<SchedulingScreen />} />
        <Route path="reports" element={<ServiceReportsScreen />} />
        <Route path="water" element={<WaterReportsScreen />} />
        <Route path="complaints" element={<ComplaintsScreen />} />
      </Route>
    </Routes>
  );
}
