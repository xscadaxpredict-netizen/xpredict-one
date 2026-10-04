import { useOrgQuery, useOrgMutation } from "@xpredict/api-client";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, payload: OrderCreatePayload) => api.createOrder(orgSlug, payload),
    onSuccess: (data, variables, context, orgSlug) => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce", "orders"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useOrgMutation({
    mutationFn: (orgSlug: string, { orderId, payload }: { orderId: string; payload: OrderStatusUpdate }) =>
      api.updateOrderStatus(orgSlug, orderId, payload),
    onSuccess: (data, variables, context, orgSlug) => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce", "orders"] });
    },
  });
}
