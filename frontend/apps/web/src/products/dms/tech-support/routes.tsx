import { Route, Routes } from "react-router-dom";
import { UserManualsScreen } from "./screens/UserManualsScreen";
import { MachineVideosScreen } from "./screens/MachineVideosScreen";
import { RequestCallScreen } from "./screens/RequestCallScreen";
// Tickets (formerly the Complaint Box) are raised here; the screen and its API
// still live with site services, where the site and visit data are.
import { ComplaintsScreen } from "../site-services/screens/ComplaintsScreen";
import { TechSupportLayout } from "./screens/TechSupportLayout";

export default function TechSupportRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TechSupportLayout />}>
        <Route path="manuals" element={<UserManualsScreen />} />
        <Route path="videos" element={<MachineVideosScreen />} />
        <Route path="calls" element={<RequestCallScreen />} />
        <Route path="tickets" element={<ComplaintsScreen />} />
      </Route>
    </Routes>
  );
}
