import { Route, Routes } from "react-router-dom";
import { UserManualsScreen } from "./screens/UserManualsScreen";
import { MachineVideosScreen } from "./screens/MachineVideosScreen";
import { RequestCallScreen } from "./screens/RequestCallScreen";
import { TimerCalculationScreen } from "./screens/TimerCalculationScreen";
import { TechSupportLayout } from "./screens/TechSupportLayout";

export default function TechSupportRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TechSupportLayout />}>
        <Route path="manuals" element={<UserManualsScreen />} />
        <Route path="videos" element={<MachineVideosScreen />} />
        <Route path="calls" element={<RequestCallScreen />} />
        <Route path="timer-calculation" element={<TimerCalculationScreen />} />
      </Route>
    </Routes>
  );
}
