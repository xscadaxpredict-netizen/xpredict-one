import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { ManualList } from "../components/ManualList";
import { UploadManualDialog } from "../components/UploadManualDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import type { UserManual } from "../api/types";
import styles from "./UserManualsScreen.module.css";

const INITIAL_MANUALS: UserManual[] = [
  { id: "m1", title: "Installation Guide - 1000 LPH RO Plant", category: "Installation", fileName: "Install_Guide_1000LPH.pdf", fileSize: "2.4 MB", description: "Step-by-step installation procedures including plumbing connections and initial flushing." },
  { id: "m2", title: "Troubleshooting Guide: High TDS Output", category: "Troubleshooting", fileName: "TS_High_TDS.pdf", fileSize: "1.1 MB", description: "Common causes for high TDS and step-by-step diagnosis." },
];

export function UserManualsScreen() {
  const [manuals, setManuals] = useState<UserManual[]>(INITIAL_MANUALS);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newManual = {
      ...formData,
      id: editingManual ? editingManual.id : `man-${Date.now()}`,
      fileName: formData.fileName || "Uploaded_Manual.pdf",
      fileSize: formData.fileSize || "1.5 MB"
    } as UserManual;

    if (editingManual) {
      setManuals(manuals.map(m => m.id === newManual.id ? newManual : m));
    } else {
      setManuals([newManual, ...manuals]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      setManuals(manuals.filter(m => m.id !== deleteId));
      setDeleteId(null);
    }
  };

  const filteredManuals = manuals.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>User Manuals & Documentation</h2>
          <p className={styles.subtitle}>Upload and manage technical documents, installation guides, and service manuals.</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => openModal()}><PlusIcon size={16} /> Upload Manual</button>
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
        onEdit={openModal}
        onDelete={setDeleteId}
      />

      <UploadManualDialog 
        isOpen={isModalOpen}
        isEditing={!!editingManual}
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
