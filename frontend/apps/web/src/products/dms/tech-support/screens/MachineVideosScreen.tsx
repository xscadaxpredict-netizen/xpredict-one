import { useState } from "react";
import { useParams } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import { VideoList } from "../components/VideoList";
import { useTechSupport } from "../api/techSupport";
import styles from "./MachineVideosScreen.module.css";

export function MachineVideosScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { videos } = useTechSupport(orgSlug!);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVideos = videos.filter(v => 
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>Machine Training & Maintenance Videos</h2>
          <p className={styles.subtitle}>Video guides for technicians on servicing, troubleshooting, and installing plants.</p>
        </div>
      </div>

      <div className={styles.actionBar}>
        <div className={styles.filterGroup}>
          <div style={{ position: "relative", width: "100%", maxWidth: "320px" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="text" 
              placeholder="Search videos by title or category..." 
              className={styles.input}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <VideoList 
        videos={filteredVideos}
      />
    </div>
  );
}
