import { XIcon, PrinterIcon } from "lucide-react";
import type { PurchaseOrder } from "../api/types";
import styles from "./POViewDialog.module.css";

interface Props {
  isOpen: boolean;
  order: PurchaseOrder | null;
  onClose: () => void;
}

export function POViewDialog({ isOpen, order, onClose }: Props) {
  if (!isOpen || !order) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Order Details #{order.id}</h3>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-2)" }}>Placed on: {order.date}</span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className={styles.btnSecondary} onClick={() => window.print()}><PrinterIcon size={14} /> Print</button>
            <button className={styles.modalClose} onClick={onClose}><XIcon size={20} /></button>
          </div>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.poPreview} id="po-preview-printable">
            <div className={styles.poTop}>
              <div>
                <h2 className={styles.companyName}>Xpredict Technologies</h2>
                <div className={styles.companyMeta}>123 Tech Park, Whitefield, Bangalore<br/>GSTIN: 29XXXXXXXXXXXXX</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <h3 style={{ margin: 0, textTransform: "uppercase" }}>Purchase Order</h3>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{order.id}</div>
                <div className={styles.companyMeta}>Date: {order.date}</div>
              </div>
            </div>

            <div className={styles.shipTo}>
              <div className={styles.shipToLabel}>Bill / Ship To</div>
              <div style={{ fontWeight: 600 }}>{order.siteName}</div>
              <div className={styles.companyMeta}>Order Code: {order.ocNumber}</div>
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
                {order.items.map((item, i) => (
                  <tr key={i} className={styles.poTableRow}>
                    <td style={{ padding: "8px" }}>{i + 1}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{item.qty}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>₹{item.price.toLocaleString()}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>₹{(item.price * item.qty).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.totalBlock}>
              <div className={styles.totalRow}><span>Subtotal</span><span>₹{order.total.toLocaleString()}</span></div>
              <div className={styles.totalRowMuted}><span>GST (18%)</span><span>₹{(order.total * 0.18).toFixed(2)}</span></div>
              <div className={styles.grandTotal}><span>Grand Total</span><span>₹{(order.total * 1.18).toFixed(2)}</span></div>
            </div>

            <div className={styles.poFooter}>
              <div className={styles.companyMeta}>This is a system generated document.</div>
              <div style={{ textAlign: "center" }}>
                <div className={styles.sigLine}></div>
                <div className={styles.sigLabel}>Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
