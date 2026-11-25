/**
 * The filter at the left of a list page's toolbar (C78; Admin panel and DMS settings):
 * "Active apps", "Active users". One component so every list page's filter
 * looks and behaves the same.
 */

import { ChevronDownIcon } from "lucide-react";

import styles from "./ListPage.module.css";

interface ListFilterProps<T extends string> {
  id: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function ListFilter<T extends string>({ id, value, options, onChange }: ListFilterProps<T>) {
  return (
    <div className={styles.filter}>
      <label htmlFor={id} className={styles.visuallyHidden}>
        Show
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={16} className={styles.chevron} aria-hidden="true" />
    </div>
  );
}
