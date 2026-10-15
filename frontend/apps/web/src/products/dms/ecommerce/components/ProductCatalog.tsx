import { ChevronDownIcon, ChevronUpIcon, PackageIcon, ShoppingCartIcon } from "lucide-react";
import type { CatalogData } from "../api/types";
import { useDmsPermissions } from "../../shared/hooks/useDmsPermissions";
import styles from "./ProductCatalog.module.css";

interface Props {
  catalog: CatalogData;
  expandedCategory: string;
  onToggleCategory: (cat: string) => void;
  onAddToCart: (id: string) => void;
}

export function ProductCatalog({ catalog, expandedCategory, onToggleCategory, onAddToCart }: Props) {
  const { canAddToCart } = useDmsPermissions();
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
                    {item.image && (
                      <div style={{ width: '100%', height: '140px', marginBottom: '12px', overflow: 'hidden', borderRadius: '4px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    )}
                    <div className={styles.productName}>{item.name}</div>
                    <ul className={styles.specList}>
                      {item.specs?.map((spec, i) => <li key={i}>{spec}</li>)}
                    </ul>
                    <div className={styles.priceRow}>
                      <span className={styles.price}>₹{item.price.toLocaleString()}</span>
                    </div>
                    {canAddToCart && (
                      <button type="button" className={styles.btnPrimary} onClick={() => onAddToCart(item.id)}>
                        <ShoppingCartIcon size={15} /> Add to Cart
                      </button>
                    )}
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
