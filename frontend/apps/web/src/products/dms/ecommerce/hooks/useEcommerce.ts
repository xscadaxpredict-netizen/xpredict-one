import { useOrgQuery, useOrgMutation } from "@xpredict/api-client";

import * as api from "../api/ecommerceApi";
import type { OrderCreatePayload, OrderStatusUpdate } from "../api/types";

export function useCatalog() {
  return useOrgQuery({
    key: ["ecommerce", "catalog"],
    queryFn: (orgSlug) => api.listCatalog(orgSlug),
  });
}

export function useOrders(siteId?: string) {
  return useOrgQuery({
    key: ["ecommerce", "orders", siteId || "all"],
    queryFn: (orgSlug) => api.listOrders(orgSlug, siteId),
  });
}

export function useCreateOrder() {
  return useOrgMutation({
    mutationFn: (orgSlug: string, payload: OrderCreatePayload) => api.createOrder(orgSlug, payload),
    invalidates: [["ecommerce", "orders"]],
  });
}

export function useUpdateOrderStatus() {
  return useOrgMutation({
    mutationFn: (orgSlug: string, { orderId, payload }: { orderId: string; payload: OrderStatusUpdate }) =>
      api.updateOrderStatus(orgSlug, orderId, payload),
    invalidates: [["ecommerce", "orders"]],
  });
}

export function useDeleteOrder() {
  return useOrgMutation({
    mutationFn: (orgSlug: string, orderId: string) => api.deleteOrder(orgSlug, orderId),
    invalidates: [["ecommerce", "orders"]],
  });
}
