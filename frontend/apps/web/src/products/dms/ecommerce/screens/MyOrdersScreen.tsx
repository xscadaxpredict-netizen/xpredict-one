import { useState } from "react";
import { useOrders } from "../hooks/useEcommerce";
import { OrdersTable } from "../components/OrdersTable";
import { RejectOrderDialog } from "../components/RejectOrderDialog";
import { POViewDialog } from "../components/POViewDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import type { PurchaseOrder } from "../api/types";
import styles from "./MyOrdersScreen.module.css";

export function MyOrdersScreen() {
  const { orders, changeStatus, removeOrder } = useOrders();
  
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Reject Modal
  const [rejectData, setRejectData] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // View Modal
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);

  const handleApprove = (id: string) => changeStatus(id, "APPROVED");
  
  const handleReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (rejectData && rejectReason.trim()) {
      changeStatus(rejectData, "REJECTED", rejectReason);
      setRejectData(null);
      setRejectReason("");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>My Orders (Purchase Orders)</h2>
        <p className={styles.subtitle}>Manage incoming POs, approve for production, or reject if unfeasible.</p>
      </div>

      <OrdersTable 
        orders={orders}
        onView={setViewOrder}
        onApprove={handleApprove}
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
        onConfirm={() => { if(deleteId) { removeOrder(deleteId); setDeleteId(null); } }}
      />
    </div>
  );
}
