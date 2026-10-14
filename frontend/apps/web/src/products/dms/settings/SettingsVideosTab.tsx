import { useState } from "react";
import { useParams } from "react-router-dom";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useTechSupport } from "../tech-support/api/techSupport";
import { VideoList } from "../tech-support/components/VideoList";
import { UploadVideoDialog } from "../tech-support/components/UploadVideoDialog";
import { ConfirmDeleteModal } from "../../../shell/components/ConfirmDeleteModal";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import type { MachineVideo } from "../tech-support/api/types";
import styles from "./SettingsPage.module.css";

export function SettingsVideosTab() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { canUploadVideo, canDeleteVideo } = useDmsPermissions();
  const { videos, uploadVideo, deleteVideo } = useTechSupport(orgSlug!);
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

  const handleSubmit = (e: React.FormEvent, files?: FileList | null) => {
    e.preventDefault();
    const formDataObj = new FormData();
    Object.keys(formData).forEach(key => {
        if (key !== "file") formDataObj.append(key, (formData as any)[key]);
    });
    if (formData.file && (formData.file as any).length > 0) formDataObj.append("file", (formData.file as any)[0]);
    else if (!editingVideo) return alert("Please select a file to upload.");
    uploadVideo(formDataObj);
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteVideo(deleteId);
      setDeleteId(null);
    }
  };

  const filteredVideos = videos.filter(v => 
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className={styles.sectionHeader} style={{ marginTop: '24px' }}>
        <h2 className={styles.sectionTitle}>Machine Videos (Tech Support)</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: "relative" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="text" 
              placeholder="Search videos..." 
              style={{ padding: '8px 12px 8px 36px', borderRadius: '6px', border: '1px solid var(--color-border)', outline: 'none' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {canUploadVideo && (
            <button className={styles.btnPrimary} onClick={() => openModal()}>
              <PlusIcon size={16} style={{ marginRight: '6px' }} /> Upload Video
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <VideoList 
          videos={filteredVideos} 
          onEdit={canUploadVideo ? openModal : undefined} 
          onDelete={canDeleteVideo ? setDeleteId : undefined} 
        />
      </div>

      <UploadVideoDialog 
        isOpen={isModalOpen} isEditing={!!editingVideo} form={formData}
        onFormChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit} onClose={() => setIsModalOpen(false)}
      />
      <ConfirmDeleteModal isOpen={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} />
    </div>
  );
}
