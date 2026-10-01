import { ChevronDownIcon, ChevronUpIcon, FileTextIcon, VideoIcon, ImageIcon } from "lucide-react";
import { MaterialCard } from "./MaterialCard";
import styles from "./MaterialAccordion.module.css";

interface Props {
  type: "brochure" | "video" | "ad";
  title: string;
  items: any[];
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
}

export function MaterialAccordion({ type, title, items, isExpanded, onToggle, onEdit, onDelete }: Props) {
  const Icon = type === "brochure" ? FileTextIcon : type === "video" ? VideoIcon : ImageIcon;

  return (
    <div className={styles.accordionItem}>
      <div className={styles.accordionHeader} onClick={onToggle}>
        <div className={styles.accordionTitle}>
          <Icon size={18} style={{ color: "var(--color-primary)" }} />
          <span>{title}</span>
          <span className={styles.accordionCount}>{items.length}</span>
        </div>
        {isExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
      </div>
      {isExpanded && (
        <div className={styles.accordionBody}>
          <div className={styles.grid}>
            {items.length === 0 ? (
              <p className={styles.emptyState}>No materials uploaded yet.</p>
            ) : (
              items.map((item) => (
                <MaterialCard
                  key={item.id}
                  item={item}
                  type={type}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
