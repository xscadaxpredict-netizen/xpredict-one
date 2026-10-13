import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { useOrders, useUpdateOrderStatus } from "../hooks/useEcommerce";
import { OrdersTable } from "../components/OrdersTable";
import { RejectOrderDialog } from "../components/RejectOrderDialog";
import { POViewDialog } from "../components/POViewDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import type { EcommerceOrder } from "../api/types";
import { useDialog } from "../../shared/hooks/useDialog";
import { Loading } from "../../../../shell/components/Loading";
import styles from "./MyOrdersScreen.module.css";

export function MyOrdersScreen() {
  const { data: orders, isPending, isError, error } = useOrders();
  const updateStatusMutation = useUpdateOrderStatus();
  const { showAlert, DialogComponent } = useDialog();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Reject Modal
  const [rejectData, setRejectData] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // View Modal
  const [viewOrder, setViewOrder] = useState<EcommerceOrder | null>(null);

  if (isPending) return <Loading />;
  if (isError) return <div style={{ padding: "var(--space-4)" }}>Error: {(error as Error).message}</div>;

  const handleApprove = (id: string) => {
    updateStatusMutation.mutate({ orderId: id, payload: { status: "APPROVED" } });
  };

  const handleDeliver = (id: string) => {
    updateStatusMutation.mutate({ orderId: id, payload: { status: "DELIVERED" } });
  };
  
  const handleReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (rejectData && rejectReason.trim()) {
      updateStatusMutation.mutate({ orderId: rejectData, payload: { status: "REJECTED", reject_reason: rejectReason } });
      setRejectData(null);
      setRejectReason("");
    }
  };

  const currentOrders = (orders || []).filter(order => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (order.po_number || "").toLowerCase().includes(query) ||
      (order.site?.customer_name || "").toLowerCase().includes(query) ||
      (order.status || "").toLowerCase().includes(query)
    );
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>My Orders (Purchase Orders)</h2>
          <p className={styles.subtitle}>Manage incoming POs, approve for production, or reject if unfeasible.</p>
        </div>
        <div style={{ position: "relative", width: "250px" }}>
          <SearchIcon size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
          <input 
            type="search" 
            placeholder="Search orders..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", height: "36px", padding: "0 10px 0 34px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
          />
        </div>
      </div>

      <OrdersTable 
        orders={currentOrders}
        onView={setViewOrder}
        onApprove={handleApprove}
        onDeliver={handleDeliver}
        onReject={(id) => { setRejectData(id); setRejectReason(""); }}
        onDelete={setDeleteId}
      />

      <RejectOrderDialog 
        isOpen={!!rejectData}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onSubmit={handleReject}
        onClose={() => setRejectData(null)}
      />

      <POViewDialog 
        isOpen={!!viewOrder}
        order={viewOrder}
        onClose={() => setViewOrder(null)}
      />

      <ConfirmDeleteModal 
        isOpen={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { showAlert("Info", "Deleting orders is not supported yet."); setDeleteId(null); }}
      />
      <DialogComponent />
    </div>
  );
}
