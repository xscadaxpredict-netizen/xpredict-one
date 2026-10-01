import { ShoppingCartIcon, PlusIcon, MinusIcon, CreditCardIcon } from "lucide-react";
import styles from "./CartSidebar.module.css";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  items: CartItem[];
  total: number;
  hasSiteSelected: boolean;
  onQtyChange: (id: string, delta: number) => void;
  onPlaceOrder: () => void;
}

export function CartSidebar({ items, total, hasSiteSelected, onQtyChange, onPlaceOrder }: Props) {
  return (
    <div className={styles.cartCol}>
      <div className={styles.cartHeader}><ShoppingCartIcon size={18} /> Order Cart</div>
      {items.length === 0 ? (
        <p className={styles.cartEmpty}>Your cart is empty.</p>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.id} className={styles.cartItem}>
              <div style={{ flex: 1 }}>
                <div className={styles.cartItemName}>{item.name}</div>
                <div className={styles.cartItemPrice}>₹{item.price.toLocaleString()} each</div>
              </div>
              <div className={styles.qtyControls}>
                <button type="button" className={styles.qtyBtn} onClick={() => onQtyChange(item.id, -1)}><MinusIcon size={12} /></button>
                <span className={styles.qtyVal}>{item.quantity}</span>
                <button type="button" className={styles.qtyBtn} onClick={() => onQtyChange(item.id, 1)}><PlusIcon size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={styles.cartTotal}>
        <span>Total:</span>
        <span>₹{total.toLocaleString()}</span>
      </div>
      <button type="button" className={styles.btnPrimary} disabled={items.length === 0 || !hasSiteSelected} onClick={onPlaceOrder}>
        <CreditCardIcon size={16} /> Place Order
      </button>
      {!hasSiteSelected && items.length > 0 && <p className={styles.warningText}>* Select a site/customer to place order</p>}
    </div>
  );
}
