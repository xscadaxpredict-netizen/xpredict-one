import { useState, useMemo } from "react";
import { PlusIcon } from "lucide-react";
import { useSites } from "../../site-services/hooks/useSiteServices";
import { useCatalog, useCreateOrder } from "../hooks/useEcommerce";
import { ProductCatalog } from "../components/ProductCatalog";
import { CartSidebar } from "../components/CartSidebar";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { OrderConfirmDialog } from "../components/OrderConfirmDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import styles from "./StoreCatalogScreen.module.css";
import type { SpareProduct } from "../api/types";

export function StoreCatalogScreen() {
  const { data: sites } = useSites();
  const { data: catalogData } = useCatalog();
  const createOrderMutation = useCreateOrder();
  
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [expandedCategory, setExpandedCategory] = useState("Pumps");
  const [cart, setCart] = useState<Record<string, number>>({});

  // Modals state
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [deleteData, setDeleteData] = useState<{category: string, id: string} | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [productForm, setProductForm] = useState({ category: "Pumps", newCategory: "", name: "", price: "", specs: "" });

  // Data helpers
  const confirmedSites = sites || [];
  const selectedSite = confirmedSites.find((s) => String(s.id) === selectedSiteId);

  // Group catalog into categories
  const groupedCatalog = useMemo(() => {
    const groups: Record<string, SpareProduct[]> = {};
    if (!catalogData) return groups;
    for (const item of catalogData) {
      const cat = item.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [catalogData]);

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
      alert(`Order placed successfully!`);
      setCart({});
      setIsConfirmingOrder(false);
    } catch (e: any) {
      alert(`Failed to place order: ${e.message}`);
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Adding/Updating products should be done from the Sales module product catalog screen.");
    setIsProductModalOpen(false);
  };

  const openEdit = (cat: string, item: any) => {
    setEditingProduct({ ...item, oldCategory: cat });
    setProductForm({ category: cat, newCategory: "", name: item.name, price: String(item.price), specs: item.specs.join(", ") });
    setIsProductModalOpen(true);
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div style={{ flex: 1, maxWidth: "400px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "0.85rem" }}>Select Site / Confirmed Order</label>
          <select className={styles.siteSelect} value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)}>
            <option value="">-- Choose a deployed site --</option>
            {confirmedSites.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.customer_name} - OC: {s.oc_number || "N/A"}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
          {selectedSite && <div className={styles.siteBadge}>Ordering for: {selectedSite.customer_name}</div>}
          <button type="button" className={styles.btnSecondary} onClick={() => { setEditingProduct(null); setProductForm({ category: Object.keys(catalog)[0] || "NEW", newCategory: "", name: "", price: "", specs: "" }); setIsProductModalOpen(true); }} style={{ width: "auto" }}>
            <PlusIcon size={16} /> Add Product
          </button>
        </div>
      </div>

      <div className={styles.contentRow}>
        <div style={{ flex: 1 }}>
          <ProductCatalog 
            catalog={groupedCatalog as any}
            expandedCategory={expandedCategory}
            onToggleCategory={(cat) => setExpandedCategory(expandedCategory === cat ? "" : cat)}
            onAddToCart={handleAddToCart}
            onEdit={openEdit}
            onDelete={(category, id) => setDeleteData({ category, id })}
          />
        </div>

        <CartSidebar 
          items={cartItems}
          total={cartTotal}
          hasSiteSelected={!!selectedSiteId}
          onQtyChange={handleQtyChange}
          onPlaceOrder={() => setIsConfirmingOrder(true)}
        />
      </div>

      <OrderConfirmDialog 
        isOpen={isConfirmingOrder && !!selectedSite}
        siteName={selectedSite?.customer_name || ""}
        ocNumber={selectedSite?.oc_number || "N/A"}
        items={cartItems}
        total={cartTotal}
        onConfirm={handleGeneratePO}
        onClose={() => setIsConfirmingOrder(false)}
      />

      <ProductFormDialog 
        isOpen={isProductModalOpen}
        isEditing={!!editingProduct}
        categories={Object.keys(catalog)}
        form={productForm}
        onFormChange={(updates) => setProductForm({ ...productForm, ...updates })}
        onSubmit={handleSaveProduct}
        onClose={() => setIsProductModalOpen(false)}
      />

      <ConfirmDeleteModal 
        isOpen={!!deleteData} 
        onCancel={() => setDeleteData(null)} 
        onConfirm={() => { alert("Product deletion must be done from the Sales module."); setDeleteData(null); }} 
      />
    </div>
  );
}
