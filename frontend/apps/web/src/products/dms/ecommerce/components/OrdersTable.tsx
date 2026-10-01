import { PackageIcon, Trash2Icon, EyeIcon } from "lucide-react";
import type { PurchaseOrder } from "../api/types";
import { OrderStatusBadge } from "./OrderStatusBadge";
import styles from "./OrdersTable.module.css";

interface Props {
  orders: PurchaseOrder[];
  onView: (order: PurchaseOrder) => void;
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}

export function OrdersTable({ orders, onView, onApprove, onReject, onDelete }: Props) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Order ID</th>
            <th className={styles.th}>Site / Customer</th>
            <th className={styles.th}>Date</th>
            <th className={styles.th}>Total</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Action</th>
            <th className={styles.th} style={{ width: "40px" }}></th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr><td colSpan={7} className={styles.emptyState}><PackageIcon size={32} style={{ margin: "0 auto 0.5rem auto", opacity: 0.4, display: "block" }} />No orders found.</td></tr>
          ) : (
            orders.map((order) => (
              <tr key={order.id} className={styles.row}>
                <td className={styles.td}><span className={styles.bold}>{order.id}</span></td>
                <td className={styles.td}>
                  <div style={{ fontWeight: 600 }}>{order.siteName}</div>
                  <div className={styles.muted}>{order.ocNumber}</div>
                </td>
                <td className={styles.td}>{order.date}</td>
                <td className={styles.td}><span className={styles.accent}>₹{order.total.toLocaleString()}</span></td>
                <td className={styles.td}>
                  <OrderStatusBadge status={order.status} />
                  {order.status === "REJECTED" && order.rejectReason && (
                    <div style={{ fontSize: "0.75rem", color: "#DC2626", marginTop: "4px", maxWidth: "200px" }}>
                      Reason: {order.rejectReason}
                    </div>
                  )}
                </td>
                <td className={styles.td}>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <button type="button" className={`${styles.btnSmall} ${styles.btnView}`} onClick={() => onView(order)}>
                      <EyeIcon size={12} /> View
                    </button>
                    {order.status === "PENDING" && (
                      <>
                        <button type="button" className={`${styles.btnSmall} ${styles.btnApprove}`} onClick={() => onApprove(order.id)}>Approve</button>
                        <button type="button" className={`${styles.btnSmall} ${styles.btnReject}`} onClick={() => onReject(order.id)}>Reject</button>
                      </>
                    )}
                  </div>
                </td>
                <td className={styles.td}>
                  <button className={styles.btnIconDanger} onClick={() => onDelete(order.id)}><Trash2Icon size={16} /></button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
