/**
 * Hooks for E-Commerce — catalog and orders state management.
 *
 * Uses local state + localStorage for the prototype.
 * When backend is ready, swap for useOrgQuery / useOrgMutation.
 */

import { useState, useEffect, useCallback } from "react";
import type { CatalogData, PurchaseOrder } from "../api/types";
import * as api from "../api/ecommerce";

// ---- Catalog ---------------------------------------------------------------

const INITIAL_CATALOG: CatalogData = {
  Pumps: [
    { id: "p1", name: "High Pressure RO Pump", price: 450, specs: ["Power: 2HP", "Flow Rate: 1000 LPH", "Material: SS304"] },
    { id: "p2", name: "Raw Water Feed Pump", price: 320, specs: ["Power: 1HP", "Flow Rate: 500 LPH", "Material: Cast Iron"] },
  ],
  Valves: [
    { id: "v1", name: "Multiport Valve (Top Mount)", price: 85, specs: ["Size: 1.5 Inch", "Type: Top Mount"] },
  ],
};

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogData>(INITIAL_CATALOG);

  useEffect(() => {
    const saved = api.fetchCatalog();
    if (Object.keys(saved).length > 0) {
      setCatalog(saved);
    } else {
      api.saveCatalog(INITIAL_CATALOG);
    }
  }, []);

  const save = useCallback((newCat: CatalogData) => {
    setCatalog(newCat);
    api.saveCatalog(newCat);
  }, []);

  const addProduct = useCallback((category: string, product: CatalogData[string][0]) => {
    setCatalog((prev) => {
      const updated = { ...prev };
      if (!updated[category]) updated[category] = [];
      updated[category] = [product, ...updated[category]];
      api.saveCatalog(updated);
      return updated;
    });
  }, []);

  const updateProduct = useCallback((oldCategory: string, newCategory: string, product: CatalogData[string][0]) => {
    setCatalog((prev) => {
      const updated = { ...prev };
      if (oldCategory !== newCategory) {
        if (updated[oldCategory]) {
          updated[oldCategory] = updated[oldCategory].filter((i) => i.id !== product.id);
          if (updated[oldCategory].length === 0) delete updated[oldCategory];
        }
      }
      if (!updated[newCategory]) updated[newCategory] = [];
      const existing = updated[newCategory].find((i) => i.id === product.id);
      if (existing) Object.assign(existing, product);
      else updated[newCategory].push(product);
      api.saveCatalog(updated);
      return updated;
    });
  }, []);

  const deleteProduct = useCallback((category: string, id: string) => {
    setCatalog((prev) => {
      const updated = { ...prev };
      if (updated[category]) {
        updated[category] = updated[category].filter((i) => i.id !== id);
        if (updated[category].length === 0) delete updated[category];
      }
      api.saveCatalog(updated);
      return updated;
    });
  }, []);

  return { catalog, save, addProduct, updateProduct, deleteProduct };
}

// ---- Orders ----------------------------------------------------------------

const SEED_ORDERS: PurchaseOrder[] = [
  { id: "ORD-3241", siteName: "TechCorp Solutions", ocNumber: "OC-1001", date: "2026-09-28", items: [{ name: "High Pressure RO Pump", qty: 2, price: 450 }, { name: 'Solenoid Valve 1/2"', qty: 5, price: 45 }], total: 1125, status: "PENDING", rejectReason: "" },
  { id: "ORD-3198", siteName: "Global Industries", ocNumber: "OC-1002", date: "2026-09-25", items: [{ name: "Twin Lobe Air Blower", qty: 1, price: 850 }], total: 850, status: "APPROVED", rejectReason: "" },
  { id: "ORD-3155", siteName: "Sri Lakshmi Industries", ocNumber: "OC-1003", date: "2026-09-20", items: [{ name: "FRP Vessel 13x54", qty: 3, price: 210 }, { name: "Brine Tank 100L", qty: 2, price: 95 }], total: 820, status: "DELIVERED", rejectReason: "" },
];

export function useOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    const saved = api.fetchOrders();
    if (saved.length > 0) setOrders(saved);
    else {
      setOrders(SEED_ORDERS);
      api.saveOrders(SEED_ORDERS);
    }
  }, []);

  const save = useCallback((newOrders: PurchaseOrder[]) => {
    setOrders(newOrders);
    api.saveOrders(newOrders);
  }, []);

  const addOrder = useCallback((order: PurchaseOrder) => {
    const result = api.createOrder(order);
    setOrders(result);
  }, []);

  const changeStatus = useCallback((orderId: string, status: PurchaseOrder["status"], reason = "") => {
    const result = api.updateOrderStatus(orderId, status, reason);
    setOrders(result);
  }, []);

  const removeOrder = useCallback((orderId: string) => {
    const result = api.deleteOrder(orderId);
    setOrders(result);
  }, []);

  return { orders, save, addOrder, changeStatus, removeOrder };
}
