/**
 * Customer name field for the enquiry form: pick an existing customer of this
 * dealership, or type a new name.
 *
 * Replaces a native <datalist>, which showed no arrow, appeared only while
 * typing, and gave no sign whether the name was new or existing. Here the list
 * opens on focus, and the line under the field always says which it is:
 * an existing customer (details filled in) or a new one (created on save).
 */

import { useId, useMemo, useState } from "react";
import type { Customer } from "../api/types";
import styles from "./CustomerPicker.module.css";

interface CustomerPickerProps {
  customers: Customer[] | undefined;
  value: string;
  selectedId: string | null;
  onType: (name: string) => void;
  onPick: (customer: Customer) => void;
}

const MAX_SHOWN = 8;
const norm = (s: string) => s.trim().toLowerCase();

export function CustomerPicker({ customers, value, selectedId, onType, onPick }: CustomerPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const all = customers ?? [];
  const query = norm(value);
  const matches = useMemo(
    () => (query ? all.filter((c) => norm(c.name).includes(query)) : all).slice(0, MAX_SHOWN),
    [all, query],
  );
  const exact = all.some((c) => norm(c.name) === query);
  const showNew = query.length > 0 && !exact;
  // Options in display order: existing matches, then "add new".
  const count = matches.length + (showNew ? 1 : 0);

  const choose = (index: number) => {
    const picked = matches[index];
    if (picked) onPick(picked);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (count ? (i + 1) % count : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (count ? (i - 1 + count) % count : 0));
    } else if (e.key === "Enter" && open && count > 0) {
      e.preventDefault(); // don't submit the form while choosing
      choose(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation(); // close the list, not the whole dialog
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.inputRow}>
        <input
          id="enq-customer"
          required
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={styles.input}
          placeholder={all.length ? "Type a new name or pick an existing customer" : "Type the customer's name"}
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            onType(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show customers"
          className={styles.toggle}
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
        >
          ▾
        </button>
      </div>

      {open && (
        <ul id={listId} role="listbox" className={styles.list}>
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.active : ""}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus so blur doesn't close first
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={styles.name}>{c.name}</span>
              <span className={styles.meta}>
                {[c.contact_person, c.phone, c.city].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
          {showNew && (
            <li
              role="option"
              aria-selected={active === matches.length}
              className={`${styles.option} ${styles.addNew} ${active === matches.length ? styles.active : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(matches.length);
              }}
              onMouseEnter={() => setActive(matches.length)}
            >
              + Add new customer “{value.trim()}”
            </li>
          )}
          {count === 0 && (
            <li className={styles.empty}>
              {all.length ? "No match." : "No customers yet. Type a name to add the first one."}
            </li>
          )}
        </ul>
      )}

      {query.length > 0 &&
        (selectedId ? (
          <div className={styles.existing}>✓ Existing customer, details filled in</div>
        ) : (
          <div className={styles.isNew}>New customer, will be created when you save</div>
        ))}
    </div>
  );
}
