import { useState, useMemo } from "react";
import { SearchIcon } from "lucide-react";
import { useSites } from "../../site-services/hooks/useSiteServices";
import { useCatalog, useCreateOrder } from "../hooks/useEcommerce";
import { ProductCatalog } from "../components/ProductCatalog";
import { CartSidebar } from "../components/CartSidebar";
import { OrderConfirmDialog } from "../components/OrderConfirmDialog";
import styles from "./StoreCatalogScreen.module.css";
import type { SpareProduct } from "../api/types";

import { useDialog } from "../../shared/hooks/useDialog";

export function StoreCatalogScreen() {
  const { data: sites } = useSites();
  const { data: catalogData } = useCatalog();
  const createOrderMutation = useCreateOrder();
  const { showAlert, DialogComponent } = useDialog();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [expandedCategory, setExpandedCategory] = useState("Pumps");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);

  // Data helpers
  const confirmedSites = sites || [];
  const selectedSite = confirmedSites.find((s) => String(s.id) === selectedSiteId);

  // Group catalog into categories
  const groupedCatalog = useMemo(() => {
    const groups: Record<string, SpareProduct[]> = {};
    if (!catalogData) return groups;
    
    const query = searchQuery.trim().toLowerCase();
    const filteredData = catalogData.filter(item => {
      if (!query) return true;
      return item.name.toLowerCase().includes(query) || 
             item.part_number.toLowerCase().includes(query) ||
             (item.category && item.category.toLowerCase().includes(query));
    });

    for (const item of filteredData) {
      const cat = item.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [catalogData, searchQuery]);

  const findItem = (itemId: string): SpareProduct | null => {
    return catalogData?.find((i) => i.id === itemId) || null;
  };

  // Cart operations
  const handleAddToCart = (id: string) => setCart((p) => ({ ...p, [id]: (p[id] || 0) + 1 }));
  const handleQtyChange = (id: string, delta: number) => {
    setCart((p) => {
      const next = (p[id] || 0) + delta;
      if (next <= 0) { const c = { ...p }; delete c[id]; return c; }
      return { ...p, [id]: next };
    });
  };

  const cartItems = Object.entries(cart).map(([id, qty]) => ({ ...findItem(id)!, quantity: qty })).filter(Boolean);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);

  // Handlers
  const handleGeneratePO = async () => {
    if (!selectedSiteId || cartItems.length === 0) return;
    
    try {
      await createOrderMutation.mutateAsync({
        site_id: selectedSiteId,
        items: cartItems.map(i => ({ product_id: i.id, quantity: i.quantity }))
      });
      showAlert("Success", `Order placed successfully!`);
      setCart({});
      setIsConfirmingOrder(false);
    } catch (e: any) {
      showAlert("Error", `Failed to place order: ${e.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.topBarGroup}>
          <label className={styles.selectLabel}>Select Site / Confirmed Order</label>
          <select className={styles.siteSelect} value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)}>
            <option value="">-- Choose a deployed site --</option>
            {confirmedSites.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.customer_name} ({s.oc_number || "No OC"})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.searchGroup}>
          {selectedSite && <div className={styles.siteBadge}>Ordering for: {selectedSite.customer_name}</div>}
          <div className={styles.searchWrapper}>
            <SearchIcon size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="search" 
              placeholder="Search catalog..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", height: "36px", padding: "0 10px 0 34px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)", boxSizing: "border-box" }}
            />
          </div>
        </div>
      </div>

      <div className={styles.contentRow}>
        <div className={styles.catalogCol}>
          <ProductCatalog 
            catalog={groupedCatalog as any}
            expandedCategory={expandedCategory}
            onToggleCategory={(cat) => setExpandedCategory(expandedCategory === cat ? "" : cat)}
            onAddToCart={handleAddToCart}
          />
        </div>

        <div id="cart-section" className={styles.cartWrapper}>
          <CartSidebar 
            items={cartItems}
            total={cartTotal}
            hasSiteSelected={!!selectedSiteId}
            onQtyChange={handleQtyChange}
            onPlaceOrder={() => setIsConfirmingOrder(true)}
          />
        </div>
      </div>

      {cartItems.length > 0 && (
        <div className={styles.mobileFloatingCart}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              {cartItems.length} {cartItems.length === 1 ? "Item" : "Items"} | ₹{cartTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
              {selectedSite ? selectedSite.customer_name : "Select site to order"}
            </div>
          </div>
          <button
            type="button"
            className={styles.btnFloatingCart}
            onClick={() => {
              document.getElementById("cart-section")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            View Cart ↓
          </button>
        </div>
      )}

      <OrderConfirmDialog 
        isOpen={isConfirmingOrder && !!selectedSite}
        siteName={selectedSite?.customer_name || ""}
        ocNumber={selectedSite?.oc_number || "N/A"}
        items={cartItems}
        total={cartTotal}
        onConfirm={handleGeneratePO}
        onClose={() => setIsConfirmingOrder(false)}
      />
      <DialogComponent />
    </div>
  );
}
