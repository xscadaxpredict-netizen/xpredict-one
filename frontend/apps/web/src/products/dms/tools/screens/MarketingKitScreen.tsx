import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { useMarketingKit } from "../hooks/useMarketingKit";
import { MaterialAccordion } from "../components/MaterialAccordion";
import type { MaterialType } from "../api/types";
import styles from "./MarketingKitScreen.module.css";

export function MarketingKitScreen() {
  const { brochures, videos, ads } = useMarketingKit();

  const [expandedSection, setExpandedSection] = useState<MaterialType | "">("brochure");
  const [searchQuery, setSearchQuery] = useState("");

  const query = searchQuery.trim().toLowerCase();
  
  const filteredBrochures = brochures.filter(item => {
    if (!query) return true;
    return item.title.toLowerCase().includes(query) || (item.category || "").toLowerCase().includes(query);
  });
  
  const filteredVideos = videos.filter(item => {
    if (!query) return true;
    return item.title.toLowerCase().includes(query);
  });
  
  const filteredAds = ads.filter(item => {
    if (!query) return true;
    return item.title.toLowerCase().includes(query) || (item.format || "").toLowerCase().includes(query);
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>Marketing Kit & Resources</h2>
          <p className={styles.subtitle}>Download product brochures, demo videos, and ad creatives.</p>
        </div>
        <div style={{ position: "relative", width: "250px" }}>
          <SearchIcon size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
          <input 
            type="search" 
            placeholder="Search materials..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", height: "36px", padding: "0 10px 0 34px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
          />
        </div>
      </div>

      <MaterialAccordion 
        type="brochure"
        title="Product Brochures & Catalogs"
        items={filteredBrochures}
        isExpanded={expandedSection === "brochure"}
        onToggle={() => setExpandedSection(expandedSection === "brochure" ? "" : "brochure")}
      />

      <MaterialAccordion 
        type="video"
        title="Machine Demo Videos"
        items={filteredVideos}
        isExpanded={expandedSection === "video"}
        onToggle={() => setExpandedSection(expandedSection === "video" ? "" : "video")}
      />

      <MaterialAccordion 
        type="ad"
        title="Promotional Banners & Ads"
        items={filteredAds}
        isExpanded={expandedSection === "ad"}
        onToggle={() => setExpandedSection(expandedSection === "ad" ? "" : "ad")}
      />
    </div>
  );
}
