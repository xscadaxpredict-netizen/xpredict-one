/**
 * New Enquiry dialog.
 *
 * Mirrors the dummy UI's enquiry creation form: customer info + initial followup.
 * Uses native <dialog> for accessibility (focus trap, Escape to close).
 */

import { useEffect, useRef, useState } from "react";
import type { Enquiry, NewEnquiry } from "../api/types";
import styles from "./NewEnquiryDialog.module.css";

interface NewEnquiryDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: NewEnquiry) => void;
  isPending: boolean;
  initialData?: Enquiry;
}

const EMPTY: NewEnquiry = {
  customer_name: "",
  contact_person: "",
  address: "",
  pincode: "",
  phone: "",
  remarks: "",
  followup_remarks: "",
  followup_next_date: "",
};

export function NewEnquiryDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  initialData,
}: NewEnquiryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<NewEnquiry>(EMPTY);

  useEffect(() => {
    if (initialData) {
      setForm({
        customer_name: initialData.customer_name,
        contact_person: initialData.contact_person,
        address: initialData.address,
        pincode: initialData.pincode,
        phone: initialData.phone,
        remarks: initialData.remarks,
        followup_remarks: "",
        followup_next_date: "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [initialData, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    setForm(EMPTY);
  };

  const update = (field: keyof NewEnquiry, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onClose}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{initialData ? "Edit Enquiry" : "New Enquiry"}</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.body}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="enq-customer">
                Customer Name
              </label>
              <input
                id="enq-customer"
                required
                type="text"
                className={styles.input}
                placeholder="e.g. Acme Corp"
                value={form.customer_name}
                onChange={(e) => update("customer_name", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="enq-contact">
                Contact Person
              </label>
              <input
                id="enq-contact"
                required
                type="text"
                className={styles.input}
                placeholder="e.g. John Smith"
                value={form.contact_person}
                onChange={(e) => update("contact_person", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label className={styles.label} htmlFor="enq-address">
                Address
              </label>
              <input
                id="enq-address"
                required
                type="text"
                className={styles.input}
                placeholder="Full address"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="enq-pincode">
                Pincode
              </label>
              <input
                id="enq-pincode"
                required
                type="text"
                className={styles.input}
                placeholder="e.g. 560001"
                value={form.pincode}
                onChange={(e) => update("pincode", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="enq-phone">
              Phone Number
            </label>
            <input
              id="enq-phone"
              required
              type="text"
              className={styles.input}
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="enq-remarks">
              Enquiry Remarks
            </label>
            <textarea
              id="enq-remarks"
              required
              className={styles.textarea}
              placeholder="What is the customer looking for?"
              value={form.remarks}
              onChange={(e) => update("remarks", e.target.value)}
            />
          </div>

          {!initialData && (
            <>
              <div className={styles.divider} />

              <h3 className={styles.sectionTitle}>Initial Follow-up</h3>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="enq-fu-remarks">
                  Follow-up Remarks
                </label>
                <textarea
                  id="enq-fu-remarks"
                  required
                  className={styles.textarea}
                  placeholder="E.g. Send pricing quote next week."
                  value={form.followup_remarks}
                  onChange={(e) => update("followup_remarks", e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="enq-fu-date">
                  Next Follow-up Date
                </label>
                <input
                  id="enq-fu-date"
                  required
                  type="date"
                  className={styles.input}
                  value={form.followup_next_date}
                  onChange={(e) => update("followup_next_date", e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isPending}
          >
            {isPending ? "Saving…" : initialData ? "Update Enquiry" : "Save Enquiry"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
