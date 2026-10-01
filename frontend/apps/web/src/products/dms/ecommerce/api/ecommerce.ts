/**
 * E-Commerce API layer.
 *
 * Handles catalog and order CRUD via localStorage for the prototype.
 * When the backend is ready, swap localStorage calls for HTTP requests.
 */

import type { CatalogData, PurchaseOrder } from "./types";

const CATALOG_KEY = "dms_catalog";
const ORDERS_KEY = "dms_orders";

// ---- Catalog ---------------------------------------------------------------

export function fetchCatalog(): CatalogData {
  const raw = localStorage.getItem(CATALOG_KEY);
  return raw ? JSON.parse(raw) : {};
}

export function saveCatalog(catalog: CatalogData): void {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
}

// ---- Orders ----------------------------------------------------------------

export function fetchOrders(): PurchaseOrder[] {
  const raw = localStorage.getItem(ORDERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveOrders(orders: PurchaseOrder[]): void {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function createOrder(order: PurchaseOrder): PurchaseOrder[] {
  const existing = fetchOrders();
  const updated = [order, ...existing];
  saveOrders(updated);
  return updated;
}

export function updateOrderStatus(
  orderId: string,
  status: PurchaseOrder["status"],
  rejectReason = ""
): PurchaseOrder[] {
  const orders = fetchOrders();
  const updated = orders.map((o) =>
    o.id === orderId ? { ...o, status, rejectReason } : o
  );
  saveOrders(updated);
  return updated;
}

export function deleteOrder(orderId: string): PurchaseOrder[] {
  const orders = fetchOrders().filter((o) => o.id !== orderId);
  saveOrders(orders);
  return orders;
}
