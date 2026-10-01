/**
 * E-Commerce module types.
 *
 * Types for catalog products, orders, and purchase orders.
 */

// ---- Catalog ---------------------------------------------------------------

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  specs: string[];
}

export type CatalogData = Record<string, CatalogProduct[]>;

// ---- Orders ----------------------------------------------------------------

export type OrderStatus = "PENDING" | "APPROVED" | "REJECTED" | "DELIVERED";

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface PurchaseOrder {
  id: string;
  siteName: string;
  ocNumber: string;
  date: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  rejectReason: string;
}
