import { useState, useEffect, useRef } from "react";
import type { BankAccount, NewBankAccount } from "../sales/api/types";
import { useCreateBank, useUpdateBank } from "../sales/hooks/useEnquiries";
import { useShellContext } from "../../../shell/context";
import { useAccess } from "../../../shell/access";
import styles from "./SettingsDialog.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  bank?: BankAccount;
}

export function BankAccountModal({ open, onClose, bank }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { membership } = useShellContext();
  const access = useAccess();
  const isOrgAdmin = !membership.unit_id && (
    membership.role === "owner" ||
    membership.role === "admin" ||
    access.can("dms.manual.manage")
  );

  const createBank = useCreateBank();
  const updateBank = useUpdateBank();

  const [formData, setFormData] = useState<NewBankAccount>({
    bank_name: "",
    account_no: "",
    ifsc_code: "",
    branch_name: "",
    is_default: false,
    is_active: true,
  });

  useEffect(() => {
    if (bank) {
      setFormData(bank);
    } else {
      setFormData({
        bank_name: "",
        account_no: "",
        ifsc_code: "",
        branch_name: "",
        is_default: false,
        is_active: true,
      });
    }
  }, [bank, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bank) {
      updateBank.mutate({ bankId: bank.id, body: formData }, {
        onSuccess: () => {
          onClose();
        }
      });
    } else {
      createBank.mutate(formData, {
        onSuccess: () => {
          onClose();
        }
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <dialog 
      ref={dialogRef} 
      className={styles.dialog}
      onKeyDown={handleKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <h2 className={styles.title}>{bank ? "Edit Bank Account" : "Add Bank Account"}</h2>
          <span className={isOrgAdmin ? styles.oemBadge : styles.dealerBadge}>
            {isOrgAdmin ? "Organization HQ Bank" : "Dealership Bank"}
          </span>
        </div>
      </header>
      
      <form onSubmit={handleSubmit}>
        <div className={styles.content}>
          <div className={styles.field}>
            <label className={styles.label}>
              Bank Name <span style={{ color: "red" }}>*</span>
            </label>
            <input 
              className={styles.input}
              value={formData.bank_name} 
              onChange={(e) => setFormData(p => ({ ...p, bank_name: e.target.value }))}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Account Number <span style={{ color: "red" }}>*</span>
            </label>
            <input 
              className={styles.input}
              value={formData.account_no} 
              onChange={(e) => setFormData(p => ({ ...p, account_no: e.target.value }))}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              IFSC Code <span style={{ color: "red" }}>*</span>
            </label>
            <input 
              className={styles.input}
              value={formData.ifsc_code} 
              onChange={(e) => setFormData(p => ({ ...p, ifsc_code: e.target.value }))}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Branch Name (Optional)</label>
            <input 
              className={styles.input}
              value={formData.branch_name || ""} 
              onChange={(e) => setFormData(p => ({ ...p, branch_name: e.target.value }))}
            />
          </div>
          <div className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            <input 
              type="checkbox"
              id="is_default"
              checked={Boolean(formData.is_default)} 
              onChange={(e) => setFormData(p => ({ ...p, is_default: e.target.checked }))}
            />
            <label htmlFor="is_default" className={styles.label} style={{ marginBottom: 0, cursor: "pointer" }}>
              Set as Default Bank Account
            </label>
          </div>
        </div>

        <footer className={styles.footer}>
          <button className={styles.btnSecondary} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={styles.btnPrimary} type="submit" disabled={createBank.isPending || updateBank.isPending}>
            {createBank.isPending || updateBank.isPending ? "Saving..." : "Save"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
