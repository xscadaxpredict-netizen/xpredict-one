import { useState, useEffect, useRef } from "react";
import type { BankAccount, NewBankAccount } from "../sales/api/types";
import { useCreateBank, useUpdateBank } from "../sales/hooks/useEnquiries";
import styles from "./SettingsDialog.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  bank?: BankAccount;
}

export function BankAccountModal({ open, onClose, bank }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
    }
  }, [bank]);

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
        <h2 className={styles.title}>{bank ? "Edit Bank Account" : "Add Bank Account"}</h2>
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
