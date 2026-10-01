/**
 * Cache key factory for the E-Commerce module.
 *
 * Module-relative — the organisation is prepended by useOrgQuery / useOrgMutation,
 * so it must NOT appear here.
 */

export const ecommerceKeys = {
  all: () => ["dms", "ecommerce"] as const,

  catalog: () => [...ecommerceKeys.all(), "catalog"] as const,

  orders: () => [...ecommerceKeys.all(), "orders"] as const,
  orderList: () => [...ecommerceKeys.orders(), "list"] as const,
};
