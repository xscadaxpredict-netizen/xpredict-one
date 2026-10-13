import { Fragment, useState } from "react";
import { PackageIcon, Trash2Icon, EyeIcon, ChevronDownIcon, ChevronUpIcon, TruckIcon } from "lucide-react";
import type { EcommerceOrder } from "../api/types";
import { OrderStatusBadge } from "./OrderStatusBadge";
import styles from "./OrdersTable.module.css";

interface Props {
  orders: EcommerceOrder[];
  onView: (order: EcommerceOrder) => void;
  onApprove: (orderId: string) => void;
  onReject: (orderId: string, currentReason?: string) => void;
  onDeliver?: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}

export function OrdersTable({ orders, onView, onApprove, onReject, onDeliver, onDelete }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
            orders.map((order) => {
              const isExpanded = expandedId === order.id;
              return (
                <Fragment key={order.id}>
                  <tr className={styles.row} onClick={() => toggleExpand(order.id)} style={{ cursor: "pointer" }}>
                    <td className={styles.td}><span className={styles.bold}>{order.id}</span></td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 600 }}>{order.site_name}</div>
                      <div className={styles.muted}>{order.oc_number}</div>
                    </td>
                    <td className={styles.td}>{new Date(order.date).toLocaleDateString()}</td>
                    <td className={styles.td}><span className={styles.accent}>₹{order.total_amount ? (order.total_amount * 1.18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</span></td>
                    <td className={styles.td}>
                      <OrderStatusBadge status={order.status} />
                      {order.status === "REJECTED" && order.reject_reason && (
                        <div style={{ fontSize: "0.75rem", color: "#DC2626", marginTop: "4px", maxWidth: "200px" }}>
                          Reason: {order.reject_reason}
                        </div>
                      )}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        <button type="button" className={`${styles.btnSmall} ${styles.btnView}`} onClick={() => onView(order)}>
                          <EyeIcon size={12} /> View PO
                        </button>
                        {order.status === "PENDING" && (
                          <button type="button" className={`${styles.btnSmall} ${styles.btnApprove}`} onClick={() => onApprove(order.id)}>Approve</button>
                        )}
                        {order.status === "APPROVED" && onDeliver && (
                          <button type="button" className={`${styles.btnSmall} ${styles.btnDeliver}`} onClick={() => onDeliver(order.id)}>
                            <TruckIcon size={12} /> Delivered
                          </button>
                        )}
                        {(order.status === "PENDING" || order.status === "APPROVED") && (
                          <button type="button" className={`${styles.btnSmall} ${styles.btnReject}`} onClick={() => onReject(order.id, order.reject_reason)}>Reject</button>
                        )}
                      </div>
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
                        <button className={styles.btnIconDanger} title="Delete Order" onClick={() => onDelete(order.id)}><Trash2Icon size={16} /></button>
                        <button
                          type="button"
                          className={styles.expandBtn}
                          title="Toggle actions"
                          onClick={() => toggleExpand(order.id)}
                        >
                          {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className={styles.expandedCell}>
                        <div className={styles.expandedContent}>
                          <div className={styles.mobileActionsBar}>
                            <button type="button" className={`${styles.btnSmall} ${styles.btnView}`} onClick={() => onView(order)}>
                              <EyeIcon size={12} /> View PO
                            </button>
                            {order.status === "PENDING" && (
                              <button type="button" className={`${styles.btnSmall} ${styles.btnApprove}`} onClick={() => onApprove(order.id)}>Approve</button>
                            )}
                            {order.status === "APPROVED" && onDeliver && (
                              <button type="button" className={`${styles.btnSmall} ${styles.btnDeliver}`} onClick={() => onDeliver(order.id)}>
                                <TruckIcon size={12} /> Delivered
                              </button>
                            )}
                            {(order.status === "PENDING" || order.status === "APPROVED") && (
                              <button type="button" className={`${styles.btnSmall} ${styles.btnReject}`} onClick={() => onReject(order.id, order.reject_reason)}>Reject</button>
                            )}
                            <button type="button" className={styles.btnIconDanger} onClick={() => onDelete(order.id)}>
                              <Trash2Icon size={16} /> Delete
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}



