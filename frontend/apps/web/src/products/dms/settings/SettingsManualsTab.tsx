import { useState } from "react";
import { useParams } from "react-router-dom";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useTechSupport } from "../tech-support/api/techSupport";
import { ManualList } from "../tech-support/components/ManualList";
import { UploadManualDialog } from "../tech-support/components/UploadManualDialog";
import { ConfirmDeleteModal } from "../../../shell/components/ConfirmDeleteModal";
import { useDmsPermissions } from "../shared/hooks/useDmsPermissions";
import type { UserManual } from "../tech-support/api/types";
import styles from "./SettingsPage.module.css";

export function SettingsManualsTab() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { canUploadManual, canDeleteManual } = useDmsPermissions();
  const { manuals, uploadManual, deleteManual } = useTechSupport(orgSlug!);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManual, setEditingManual] = useState<UserManual | null>(null);
  const [formData, setFormData] = useState<Partial<UserManual>>({});

  const openModal = (manual?: UserManual) => {
    if (manual) {
      setEditingManual(manual);
      setFormData({ ...manual });
    } else {
      setEditingManual(null);
      setFormData({});
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent, _files?: FileList | null) => {
    e.preventDefault();
    const formDataObj = new FormData();
    Object.keys(formData).forEach(key => {
        if (key !== "file") formDataObj.append(key, (formData as any)[key]);
    });
    if (formData.file && (formData.file as any).length > 0) formDataObj.append("file", (formData.file as any)[0]);
    else if (!editingManual) return alert("Please select a file to upload.");
    uploadManual(formDataObj);
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteManual(deleteId);
      setDeleteId(null);
    }
  };

  const filteredManuals = manuals.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className={styles.sectionHeader} style={{ marginTop: '24px' }}>
        <h2 className={styles.sectionTitle}>User Manuals (Tech Support)</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: "relative" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-3)" }} />
            <input 
              type="text" 
              placeholder="Search manuals..." 
              style={{ padding: '8px 12px 8px 36px', borderRadius: '6px', border: '1px solid var(--color-border)', outline: 'none' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {canUploadManual && (
            <button className={styles.btnPrimary} onClick={() => openModal()}>
              <PlusIcon size={16} style={{ marginRight: '6px' }} /> Upload Manual
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <ManualList 
          manuals={filteredManuals} 
          onEdit={canUploadManual ? openModal : undefined} 
          onDelete={canDeleteManual ? setDeleteId : undefined} 
        />
      </div>

      <UploadManualDialog 
        isOpen={isModalOpen} isEditing={!!editingManual} form={formData}
        onFormChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
        onSubmit={handleSubmit} onClose={() => setIsModalOpen(false)}
      />
      <ConfirmDeleteModal isOpen={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} />
    </div>
  );
}
