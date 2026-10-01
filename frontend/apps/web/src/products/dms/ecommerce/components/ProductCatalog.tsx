import { ChevronDownIcon, ChevronUpIcon, PackageIcon, ShoppingCartIcon, Edit2Icon, Trash2Icon } from "lucide-react";
import type { CatalogData } from "../api/types";
import styles from "./ProductCatalog.module.css";

interface Props {
  catalog: CatalogData;
  expandedCategory: string;
  onToggleCategory: (cat: string) => void;
  onAddToCart: (id: string) => void;
  onEdit: (category: string, item: any) => void;
  onDelete: (category: string, id: string) => void;
}

export function ProductCatalog({ catalog, expandedCategory, onToggleCategory, onAddToCart, onEdit, onDelete }: Props) {
  return (
    <div className={styles.accordion}>
      {Object.entries(catalog).map(([category, items]) => (
        <div key={category} className={styles.accordionItem}>
          <div className={styles.accordionHeader} onClick={() => onToggleCategory(category)}>
            <div className={styles.accordionTitle}>
              <PackageIcon size={18} style={{ color: "var(--color-primary)" }} />
              <span>{category}</span>
              <span className={styles.accordionCount}>{items.length}</span>
            </div>
            {expandedCategory === category ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </div>
          {expandedCategory === category && (
            <div className={styles.accordionBody}>
              <div className={styles.productGrid}>
                {items.map((item) => (
                  <div key={item.id} className={styles.productCard}>
                    <div className={styles.productActions}>
                      <button className={styles.iconBtn} onClick={() => onEdit(category, item)}><Edit2Icon size={14} /></button>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(category, item.id)}><Trash2Icon size={14} /></button>
                    </div>
                    <div className={styles.productName}>{item.name}</div>
                    <ul className={styles.specList}>
                      {item.specs.map((spec, i) => <li key={i}>{spec}</li>)}
                    </ul>
                    <div className={styles.priceRow}>
                      <span className={styles.price}>₹{item.price.toLocaleString()}</span>
                    </div>
                    <button type="button" className={styles.btnPrimary} onClick={() => onAddToCart(item.id)}>
                      <ShoppingCartIcon size={15} /> Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
