import { Route, Routes } from "react-router-dom";
import { ToolsLayout } from "./screens/ToolsLayout";
import { MarketingKitScreen } from "./screens/MarketingKitScreen";
import { CapacityCalculatorScreen } from "./screens/CapacityCalculatorScreen";
import { FeasibilityScreen } from "./screens/FeasibilityScreen";

export default function ToolsRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ToolsLayout />}>
        <Route path="marketing" element={<MarketingKitScreen />} />
        <Route path="calculator" element={<CapacityCalculatorScreen />} />
        <Route path="feasibility" element={<FeasibilityScreen />} />
      </Route>
    </Routes>
  );
}
