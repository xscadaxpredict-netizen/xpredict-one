import { Route, Routes, Navigate } from "react-router-dom";
import { ToolsLayout } from "./screens/ToolsLayout";
import { MarketingKitScreen } from "./screens/MarketingKitScreen";
import { CapacityCalculatorScreen } from "./screens/CapacityCalculatorScreen";
import { ECDosingCalculatorScreen } from "./screens/ECDosingCalculatorScreen";
import { FeasibilityScreen } from "./screens/FeasibilityScreen";
import { CalculatorSettingsScreen } from "./screens/CalculatorSettingsScreen";
import { useShellContext } from "../../../shell/context";
import { useAccess } from "../../../shell/access";

function OrgAdminOnly({ children }: { children: React.ReactNode }) {
  const { membership } = useShellContext();
  const access = useAccess();
  const isManagerOrAdmin =
    membership.role === "owner" ||
    membership.role === "admin" ||
    access.can("dms.calculator.manage") ||
    access.can("dms.enquiry.close") ||
    access.can("dms.order.confirm") ||
    access.can("admin.person.invite") ||
    access.can("dms.manual.manage");

  if (!isManagerOrAdmin) {
    return <Navigate to="../calculator" replace />;
  }
  return <>{children}</>;
}

export default function ToolsRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ToolsLayout />}>
        <Route path="marketing" element={<MarketingKitScreen />} />
        <Route path="calculator" element={<CapacityCalculatorScreen />} />
        <Route path="ec-dosing" element={<ECDosingCalculatorScreen />} />
        <Route path="feasibility" element={<FeasibilityScreen />} />
        <Route path="settings" element={<OrgAdminOnly><CalculatorSettingsScreen /></OrgAdminOnly>} />
      </Route>
    </Routes>
  );
}
