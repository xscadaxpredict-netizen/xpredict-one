/**
 * Pick one deployed site by typing: customer name, OC number, site name or
 * address. Empty means "all sites". The list opens on focus and narrows as
 * you type; arrow keys and Enter choose, Escape closes.
 */

import { useId, useMemo, useState } from "react";
import type { ConfirmedSite } from "../api/types";
import styles from "./SiteSearchSelect.module.css";

interface SiteSearchSelectProps {
  sites: ConfirmedSite[];
  value: string;
  onChange: (siteId: string) => void;
  placeholder?: string;
}

const label = (s: ConfirmedSite) => `${s.customer_name} (${s.oc_number || "No OC"})`;

export function SiteSearchSelect({ sites, value, onChange, placeholder }: SiteSearchSelectProps) {
  const listId = useId();
  const selected = sites.find((s) => s.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) =>
      [s.customer_name, s.oc_number, s.site_name, s.address, s.pincode]
        .some((field) => (field || "").toLowerCase().includes(q)),
    );
  }, [sites, query]);

  const choose = (site: ConfirmedSite | undefined) => {
    onChange(site?.id ?? "");
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (matches.length ? (i + 1) % matches.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={styles.input}
        placeholder={selected ? label(selected) : placeholder ?? `Search all deployed sites (${sites.length})`}
        value={open ? query : selected ? label(selected) : ""}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {selected && !open && (
        <button
          type="button"
          className={styles.clear}
          aria-label="Show all sites"
          title="Show all sites"
          onMouseDown={(e) => { e.preventDefault(); choose(undefined); }}
        >
          ×
        </button>
      )}
      {open && (
        <ul id={listId} role="listbox" className={styles.list}>
          {matches.length === 0 && <li className={styles.empty}>No site matches “{query}”.</li>}
          {matches.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              className={`${styles.option} ${i === active ? styles.active : ""}`}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={styles.name}>{s.customer_name}</span>
              <span className={styles.meta}>
                {[s.oc_number || "No OC", s.site_name, s.address].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
