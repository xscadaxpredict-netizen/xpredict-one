export interface SpareProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  part_number: string;
  hsn_code: string;
}

export type OrderStatus = "PENDING" | "APPROVED" | "REJECTED" | "DELIVERED";

export interface OrderItem {
  id?: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  line_total: number;
}

export interface EcommerceOrder {
  id: string;
  site_id: string;
  order_number: string;
  site_name: string;
  oc_number: string;
  status: OrderStatus;
  reject_reason: string;
  total_amount: number;
  date: string;
  items: OrderItem[];
}

export interface OrderCreatePayload {
  site_id: string;
  items: { product_id: string; quantity: number }[];
}

export interface OrderStatusUpdate {
  status: OrderStatus;
  reject_reason?: string;
}
