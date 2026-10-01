import type { OrderStatus } from "../api/types";
import styles from "./OrderStatusBadge.module.css";

interface Props {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: Props) {
  const cls = styles[`badge${status.charAt(0) + status.slice(1).toLowerCase()}`] || styles.badgePending;
  return <span className={cls}>{status}</span>;
}
