import { useState } from "react";
import { useParams } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import { ManualList } from "../components/ManualList";
import { useTechSupport } from "../api/techSupport";
import styles from "./UserManualsScreen.module.css";

export function UserManualsScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { manuals } = useTechSupport(orgSlug!);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredManuals = manuals.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>User Manuals & Documentation</h2>
          <p className={styles.subtitle}>View technical documents, installation guides, and service manuals.</p>
        </div>
      </div>

      <div className={styles.actionBar}>
        <div className={styles.filterGroup}>
          <div style={{ position: "relative", width: "100%", maxWidth: "320px" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="text" 
              placeholder="Search manuals by title or category..." 
              className={styles.input}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <ManualList 
        manuals={filteredManuals}
      />
    </div>
  );
}
