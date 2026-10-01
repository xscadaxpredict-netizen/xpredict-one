import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BookOpenIcon, PlaySquareIcon, PhoneCallIcon, ClockIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";

export function TechSupportLayout() {
  const location = useLocation();

  const tabs = [
    { id: "manuals", label: "User Manuals", path: "manuals", icon: <BookOpenIcon size={16} /> },
    { id: "videos", label: "Machine Videos", path: "videos", icon: <PlaySquareIcon size={16} /> },
    { id: "calls", label: "Request for Call", path: "calls", icon: <PhoneCallIcon size={16} /> },
    { id: "timer-calculation", label: "Timer Calculation", path: "timer-calculation", icon: <ClockIcon size={16} /> },
  ];

  // If we are exactly on /tech-support, redirect to manuals tab
  if (location.pathname.endsWith("/tech-support") || location.pathname.endsWith("/tech-support/")) {
    return <Navigate to="manuals" replace />;
  }

  return (
    <div style={{ padding: "var(--space-6)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: "0 0 var(--space-1) 0" }}>
          Installation & Technical Support
        </h1>
        <p style={{ color: "var(--color-text-2)", fontSize: "var(--text-sm)", margin: 0 }}>
          Access product documentation, installation videos, and manage callback requests.
        </p>
      </div>

      <TabBar tabs={tabs} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
