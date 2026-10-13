import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingCartIcon,
  PackageCheckIcon,
  ClockIcon,
  IndianRupeeIcon,
  StoreIcon,
  ListOrderedIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  BoxIcon,
} from "lucide-react";
import { useOrders, useCatalog } from "../hooks/useEcommerce";
import styles from "./EcommerceDashboardScreen.module.css";

export function EcommerceDashboardScreen() {
  const navigate = useNavigate();
  const { data: orders = [], isPending: ordersLoading } = useOrders();
  const { data: catalog = [], isPending: catalogLoading } = useCatalog();

  const isPending = ordersLoading || catalogLoading;

  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
    const approvedOrders = orders.filter((o) => o.status === "APPROVED").length;
    const deliveredOrders = orders.filter((o) => o.status === "DELIVERED").length;
    const rejectedOrders = orders.filter((o) => o.status === "REJECTED").length;

    // Total gross volume for valid orders
    const totalRevenue = orders.reduce(
      (sum, o) => (o.status !== "REJECTED" ? sum + (Number(o.total_amount) || 0) : sum),
      0
    );

    // Most frequently requested spares
    const itemFreqMap: Record<string, { name: string; qty: number; count: number }> = {};
    orders.forEach((o) => {
      if (o.items && o.items.length > 0) {
        o.items.forEach((it) => {
          const key = it.name || "Item";
          if (!itemFreqMap[key]) {
            itemFreqMap[key] = { name: key, qty: 0, count: 0 };
          }
          itemFreqMap[key].qty += Number(it.quantity) || 1;
          itemFreqMap[key].count += 1;
        });
      }
    });

    const topSpares = Object.values(itemFreqMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 5);

    return {
      totalOrders,
      pendingOrders,
      approvedOrders,
      deliveredOrders,
      rejectedOrders,
      totalRevenue,
      catalogCount: catalog.length,
      topSpares,
      recentOrders,
    };
  }, [orders, catalog]);

  if (isPending) {
    return <div style={{ padding: "var(--space-6)" }}>Loading E-Commerce Dashboard...</div>;
  }

  const formatCurrency = (val: number) => {
    return "₹" + val.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  };

  return (
    <div className={styles.container}>
      {/* Top Header & Actions */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2>E-Commerce & Spares Dashboard</h2>
          <p>Track spare parts purchase orders, fulfillment pipeline, and consumables inventory.</p>
        </div>
        <div className={styles.actionButtons}>
          <Link to="../orders" className={styles.secondaryBtn}>
            <ListOrderedIcon size={15} /> All Orders
          </Link>
          <button onClick={() => navigate("../catalog")} className={styles.primaryBtn}>
            <ShoppingCartIcon size={15} /> Browse Catalog
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Total Orders */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Total Orders</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconBlue}`}>
              <ShoppingCartIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.totalOrders}</div>
          <div className={styles.kpiFooter}>
            <span className={`${styles.kpiBadge} ${styles.badgePending}`}>
              {metrics.pendingOrders} Pending
            </span>
            <span className={`${styles.kpiBadge} ${styles.badgeSuccess}`}>
              {metrics.approvedOrders + metrics.deliveredOrders} Fulfilled
            </span>
          </div>
        </div>

        {/* Card 2: Total Order Revenue */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Spares Order Value</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconGreen}`}>
              <IndianRupeeIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{formatCurrency(metrics.totalRevenue)}</div>
          <div className={styles.kpiFooter}>
            <span>Approved & delivered orders volume</span>
          </div>
        </div>

        {/* Card 3: Pending Approvals */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Pending Approvals</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconAmber}`}>
              <ClockIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.pendingOrders}</div>
          <div className={styles.kpiFooter}>
            {metrics.pendingOrders > 0 ? (
              <span className={`${styles.kpiBadge} ${styles.badgePending}`}>
                Action required on orders
              </span>
            ) : (
              <span className={`${styles.kpiBadge} ${styles.badgeSuccess}`}>
                All orders approved
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Store Catalog Items */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Available Spares</span>
            <div className={`${styles.kpiIconWrapper} ${styles.iconPurple}`}>
              <StoreIcon size={18} />
            </div>
          </div>
          <div className={styles.kpiValue}>{metrics.catalogCount}</div>
          <div className={styles.kpiFooter}>
            <span>Consumables & replacement parts</span>
          </div>
        </div>
      </div>

      {/* Dual Grid: Order Pipeline Status & Frequently Ordered Spares */}
      <div className={styles.dualGrid}>
        {/* Left: Order Pipeline Status */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <PackageCheckIcon size={18} color="var(--color-primary)" />
              Order Fulfillment Pipeline
            </div>
            <Link to="../orders" className={styles.panelAction}>
              Manage Orders <ArrowRightIcon size={12} style={{ display: "inline" }} />
            </Link>
          </div>

          <div className={styles.statusChips}>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#d97706" }}>
                {metrics.pendingOrders}
              </div>
              <div className={styles.statusChipLabel}>Pending</div>
            </div>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#2563eb" }}>
                {metrics.approvedOrders}
              </div>
              <div className={styles.statusChipLabel}>Approved</div>
            </div>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#059669" }}>
                {metrics.deliveredOrders}
              </div>
              <div className={styles.statusChipLabel}>Delivered</div>
            </div>
            <div className={styles.statusChip}>
              <div className={styles.statusChipNum} style={{ color: "#b3261e" }}>
                {metrics.rejectedOrders}
              </div>
              <div className={styles.statusChipLabel}>Rejected</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--color-text-2)", marginBottom: 4 }}>
              <span>Fulfillment Completion Rate</span>
              <span style={{ fontWeight: 600 }}>
                {metrics.totalOrders > 0
                  ? `${(((metrics.approvedOrders + metrics.deliveredOrders) / metrics.totalOrders) * 100).toFixed(0)}%`
                  : "0%"}
              </span>
            </div>
            <div style={{ height: 8, background: "var(--color-surface-alt)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${
                    metrics.totalOrders > 0
                      ? ((metrics.approvedOrders + metrics.deliveredOrders) / metrics.totalOrders) * 100
                      : 0
                  }%`,
                  background: "var(--color-success)",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        </div>

        {/* Right: Most In-Demand Spares */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <BoxIcon size={18} color="#7c3aed" />
              Top Requested Spares & Parts
            </div>
            <Link to="../catalog" className={styles.panelAction}>
              View Catalog <ArrowRightIcon size={12} style={{ display: "inline" }} />
            </Link>
          </div>

          {metrics.topSpares.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2Icon size={24} color="var(--color-text-3)" style={{ margin: "0 auto 6px auto", display: "block" }} />
              No parts ordered yet.
            </div>
          ) : (
            <div className={styles.spareList}>
              {metrics.topSpares.map((sp, idx) => (
                <div key={idx} className={styles.spareItem}>
                  <div className={styles.spareName}>{sp.name}</div>
                  <div className={styles.spareCount}>
                    <span style={{ fontWeight: 600, color: "var(--color-text)" }}>{sp.qty} units</span> in {sp.count} order{sp.count > 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Recent Purchase Orders */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <ClockIcon size={18} color="var(--color-text-2)" />
            Recent Purchase Orders
          </div>
          <Link to="../orders" className={styles.panelAction}>
            View All Orders <ArrowRightIcon size={12} style={{ display: "inline" }} />
          </Link>
        </div>

        {metrics.recentOrders.length === 0 ? (
          <div className={styles.emptyState}>No purchase orders placed yet.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Site / Customer</th>
                  <th>OC Number</th>
                  <th>Items</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentOrders.map((ord) => (
                  <tr key={ord.id}>
                    <td style={{ fontWeight: 600 }}>{ord.order_number || "ORD-PENDING"}</td>
                    <td>{ord.site_name || "—"}</td>
                    <td>{ord.oc_number || "—"}</td>
                    <td>{ord.items?.length || 0} items</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(Number(ord.total_amount) || 0)}</td>
                    <td>
                      <span
                        className={`${styles.kpiBadge} ${
                          ord.status === "DELIVERED" || ord.status === "APPROVED"
                            ? styles.badgeSuccess
                            : ord.status === "REJECTED"
                            ? styles.badgeDanger
                            : styles.badgePending
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--color-text-3)", fontSize: "var(--text-xs)" }}>
                      {ord.date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
