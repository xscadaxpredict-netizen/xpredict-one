import { Outlet } from "react-router-dom";
import { TagIcon, CheckSquareIcon, FileTextIcon } from "lucide-react";
import { TabBar } from "../../shared/components/TabBar";

export function SalesLayout() {
  const tabs = [
    { id: "enquiries", label: "Enquiries", path: "enquiries", icon: <TagIcon size={16} /> },
    { id: "orders", label: "Confirmed Orders", path: "orders", icon: <CheckSquareIcon size={16} /> },
    { id: "quotations", label: "Quotations", path: "quotations", icon: <FileTextIcon size={16} /> },
  ];

  return (
    <div style={{ padding: "var(--space-6)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: 0, color: "var(--color-text)" }}>
          Sales Management
        </h1>
        <p style={{ margin: "var(--space-1) 0 0 0", color: "var(--color-text-2)", fontSize: "var(--text-sm)" }}>
          Track incoming enquiries, create quotations, and manage confirmed orders.
        </p>
      </div>

      <TabBar tabs={tabs} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
