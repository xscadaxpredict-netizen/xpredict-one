import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { VideoList } from "../components/VideoList";
import { UploadVideoDialog } from "../components/UploadVideoDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import type { MachineVideo } from "../api/types";
import styles from "./MachineVideosScreen.module.css";

const INITIAL_VIDEOS: MachineVideo[] = [
  { id: "v1", title: "Membrane Flushing Procedure", duration: "04:15", resolution: "1080p", fileName: "Membrane_Flush.mp4", category: "Maintenance", description: "Demonstrates the correct sequence for chemical flushing of RO membranes." },
  { id: "v2", title: "Resin Replacement - Multiport Valve", duration: "08:30", resolution: "1080p", fileName: "Resin_Replace.mp4", category: "Maintenance", description: "How to safely remove and replace ion-exchange resin in automatic softeners." },
];

export function MachineVideosScreen() {
  const [videos, setVideos] = useState<MachineVideo[]>(INITIAL_VIDEOS);
  const [searchQuery, setSearchQuery] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<MachineVideo | null>(null);
  const [formData, setFormData] = useState<Partial<MachineVideo>>({});

  const openModal = (video?: MachineVideo) => {
    if (video) {
      setEditingVideo(video);
      setFormData({ ...video });
    } else {
      setEditingVideo(null);
      setFormData({});
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newVideo = {
      ...formData,
      id: editingVideo ? editingVideo.id : `vid-${Date.now()}`,
      fileName: formData.fileName || "Uploaded_Video.mp4",
    } as MachineVideo;

    if (editingVideo) {
      setVideos(videos.map(v => v.id === newVideo.id ? newVideo : v));
    } else {
      setVideos([newVideo, ...videos]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      setVideos(videos.filter(v => v.id !== deleteId));
      setDeleteId(null);
    }
  };

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
        <button className={styles.btnPrimary} onClick={() => openModal()}><PlusIcon size={16} /> Upload Video</button>
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
        onEdit={openModal}
        onDelete={setDeleteId}
      />

      <UploadVideoDialog 
        isOpen={isModalOpen}
        isEditing={!!editingVideo}
        form={formData}
        onFormChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />

      <ConfirmDeleteModal 
        isOpen={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
