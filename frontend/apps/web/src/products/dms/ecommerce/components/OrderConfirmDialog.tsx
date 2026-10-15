import { XIcon } from "lucide-react";
import styles from "./OrderConfirmDialog.module.css";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  isOpen: boolean;
  siteName: string;
  ocNumber: string;
  items: OrderItem[];
  total: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function OrderConfirmDialog({ isOpen, siteName, ocNumber, items, total, onConfirm, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Confirm Purchase Order</h3>
          <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
        </div>
        <div className={styles.modalBody}>
          <p>Please review your order details before generating the Purchase Order.</p>
          <div className={styles.poPreview} id="po-preview-printable">
            <div className={styles.poTop}>
              <div>
                <h2 className={styles.companyName}>Xpredict Technologies</h2>
                <div className={styles.companyMeta}>123 Tech Park, Whitefield, Bangalore<br/>GSTIN: 29XXXXXXXXXXXXX</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <h3 style={{ margin: 0, textTransform: "uppercase" }}>Purchase Order</h3>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>DRAFT</div>
                <div className={styles.companyMeta}>Date: {new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <div className={styles.shipTo}>
              <div className={styles.shipToLabel}>Bill / Ship To</div>
              <div style={{ fontWeight: 600 }}>{siteName}</div>
              <div className={styles.companyMeta}>Order Code: {ocNumber}</div>
            </div>

            <table className={styles.poTable}>
              <thead>
                <tr className={styles.poTableHead}>
                  <th style={{ padding: "8px", textAlign: "left" }}>#</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Item Description</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Unit Price</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className={styles.poTableRow}>
                    <td style={{ padding: "8px" }}>{i + 1}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{item.quantity}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>₹{item.price.toLocaleString()}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>₹{(item.price * item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.totalBlock}>
              <div className={styles.totalRow}><span>Subtotal</span><span>₹{total.toLocaleString()}</span></div>
              <div className={styles.totalRowMuted}><span>GST (18%)</span><span>₹{(total * 0.18).toFixed(2)}</span></div>
              <div className={styles.grandTotal}><span>Grand Total</span><span>₹{(total * 1.18).toFixed(2)}</span></div>
            </div>

            <div className={styles.poFooter}>
              <div className={styles.companyMeta}>Draft document. Will be finalized upon confirmation.</div>
              <div style={{ textAlign: "center" }}>
                <div className={styles.sigLine}></div>
                <div className={styles.sigLabel}>Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={onConfirm}>Confirm & Generate PO</button>
        </div>
      </div>
    </div>
  );
}
