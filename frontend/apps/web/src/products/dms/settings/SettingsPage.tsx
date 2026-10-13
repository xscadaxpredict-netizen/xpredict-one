import { useState } from "react";
import { useBanks, useProductPresets, useDeleteBank, useDeleteProductPreset } from "../sales/hooks/useEnquiries";
import { BankAccountModal } from "./BankAccountModal";
import { ProductModal } from "./ProductModal";
import { SettingsManualsTab } from "./SettingsManualsTab";
import { SettingsVideosTab } from "./SettingsVideosTab";
import { SettingsMarketingTab } from "./SettingsMarketingTab";
import { CalculatorSettingsScreen } from "../tools/screens/CalculatorSettingsScreen";
import type { BankAccount, ProductPreset } from "../sales/api/types";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"banks" | "products" | "manuals" | "videos" | "marketing" | "calculator">("banks");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Master Data Settings</h1>
          <p className={styles.subtitle}>
            Manage your organization's bank accounts and product catalog.
          </p>
        </div>
      </header>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tabBtn} ${activeTab === "banks" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("banks")}
        >
          Bank Accounts
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === "products" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("products")}
        >
          Product Catalog
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === "manuals" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("manuals")}
        >
          User Manuals
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === "videos" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("videos")}
        >
          Machine Videos
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === "marketing" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("marketing")}
        >
          Marketing Kit
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === "calculator" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("calculator")}
        >
          Calculator Constants
        </button>
      </div>

      {activeTab === "banks" && <BankAccountsTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "manuals" && <SettingsManualsTab />}
      {activeTab === "videos" && <SettingsVideosTab />}
      {activeTab === "marketing" && <SettingsMarketingTab />}
      {activeTab === "calculator" && <CalculatorSettingsScreen />}
    </div>
  );
}

function BankAccountsTab() {
  const { data: banks, isLoading } = useBanks();
  const deleteBank = useDeleteBank();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<BankAccount | undefined>();

  if (isLoading) return <div className={styles.emptyState}>Loading banks...</div>;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Bank Accounts</h2>
        <button className={styles.btnPrimary} onClick={() => { setSelectedBank(undefined); setIsModalOpen(true); }}>
          <PlusCircleIcon /> Add Bank Account
        </button>
      </div>

      <div className={styles.list}>
        {banks?.map(bank => (
          <div key={bank.id} className={styles.card}>
            <div className={styles.cardMain}>
              <h3 className={styles.cardTitle}>{bank.bank_name}</h3>
              <p className={styles.cardDesc}>A/C: {bank.account_no} | IFSC: {bank.ifsc_code}</p>
              {bank.branch_name && <p className={styles.cardDesc}>Branch: {bank.branch_name}</p>}
            </div>
            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => { setSelectedBank(bank); setIsModalOpen(true); }}>
                <PencilIcon /> Edit
              </button>
              <button className={styles.btnDanger} onClick={() => { if(confirm("Are you sure?")) deleteBank.mutate(bank.id); }}>
                <TrashIcon /> Delete
              </button>
            </div>
          </div>
        ))}
        {banks?.length === 0 && <div className={styles.emptyState}>No bank accounts added yet.</div>}
      </div>

      {isModalOpen && (
        <BankAccountModal 
          open={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          bank={selectedBank} 
        />
      )}
    </div>
  );
}

function ProductsTab() {
  const { data: products, isLoading } = useProductPresets();
  const deleteProduct = useDeleteProductPreset();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductPreset | undefined>();
  const [filterType, setFilterType] = useState<string>("ALL");

  if (isLoading) return <div className={styles.emptyState}>Loading products...</div>;

  const productTypes = Array.from(new Set(products?.map(p => p.type) || [])).filter(Boolean);
  const displayedProducts = products?.filter(p => filterType === "ALL" || p.type === filterType) || [];

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Product Catalog</h2>
        <div className={styles.headerActions}>
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="ALL">All Product Types</option>
            {productTypes.map(t => (
              <option key={t} value={t}>{t === "NORMAL" ? "MACHINE" : t}</option>
            ))}
          </select>
          <button className={styles.btnPrimary} onClick={() => { setSelectedProduct(undefined); setIsModalOpen(true); }}>
            <PlusCircleIcon /> Add Product
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {displayedProducts.map(product => (
          <div key={product.id} className={styles.card}>
            <div className={styles.cardMain}>
              <h3 className={styles.cardTitle}>
                {product.name || product.description}
                <span className={styles.badge}>{product.type === "NORMAL" ? "MACHINE" : product.type}</span>
              </h3>
              <p className={styles.cardDesc}>{product.description}</p>
              <div className={styles.cardMeta}>
                <div>HSN: <span>{product.hsn || "-"}</span></div>
                <div>Base Price: <span>₹{product.base_price}</span></div>
                <div>Margin: <span>{product.margin !== null ? `${product.margin}%` : "Set in Quote"}</span></div>
                <div>GST: <span>{product.gst_rate}%</span></div>
              </div>
              {product.type === "SPARES" && product.specs && product.specs.length > 0 && (
                <div style={{ marginTop: "12px", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  <strong style={{ color: "var(--color-text)" }}>Specs: </strong>
                  {product.specs.join(", ")}
                </div>
              )}
            </div>
            <div className={styles.productRight}>
              {product.image && (
                <div className={styles.productImageWrapper}>
                  <img src={product.image} alt={product.name} className={styles.productImage} />
                </div>
              )}
              <div className={styles.actions}>
                <button className={styles.btnSecondary} onClick={() => { setSelectedProduct(product); setIsModalOpen(true); }}>
                  <PencilIcon /> Edit
                </button>
                <button className={styles.btnDanger} onClick={() => { if(confirm("Are you sure?")) deleteProduct.mutate(product.id); }}>
                  <TrashIcon /> Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {displayedProducts.length === 0 && <div className={styles.emptyState}>No products found.</div>}
      </div>

      {isModalOpen && (
        <ProductModal 
          open={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          product={selectedProduct} 
        />
      )}
    </div>
  );
}

function PlusCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
