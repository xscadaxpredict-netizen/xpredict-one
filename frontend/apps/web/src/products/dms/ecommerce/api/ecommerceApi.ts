import { request } from "../../shared/api/request";
import type { SpareProduct, EcommerceOrder, OrderCreatePayload, OrderStatusUpdate } from "./types";

export async function listCatalog(orgSlug: string): Promise<SpareProduct[]> {
  return request<SpareProduct[]>(`/api/v1/orgs/${orgSlug}/dms/ecommerce/catalog/`);
}

export async function listOrders(orgSlug: string, siteId?: string): Promise<EcommerceOrder[]> {
  const qs = siteId ? `?site_id=${siteId}` : "";
  return request<EcommerceOrder[]>(`/api/v1/orgs/${orgSlug}/dms/ecommerce/orders/${qs}`);
}

export async function createOrder(orgSlug: string, payload: OrderCreatePayload): Promise<EcommerceOrder> {
  return request<EcommerceOrder>(`/api/v1/orgs/${orgSlug}/dms/ecommerce/orders/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrder(orgSlug: string, orderId: string): Promise<EcommerceOrder> {
  return request<EcommerceOrder>(`/api/v1/orgs/${orgSlug}/dms/ecommerce/orders/${orderId}/`);
}

export async function updateOrderStatus(
  orgSlug: string,
  orderId: string,
  payload: OrderStatusUpdate,
): Promise<EcommerceOrder> {
  return request<EcommerceOrder>(`/api/v1/orgs/${orgSlug}/dms/ecommerce/orders/${orderId}/status/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
