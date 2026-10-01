import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useMarketingKit } from "../hooks/useMarketingKit";
import { MaterialAccordion } from "../components/MaterialAccordion";
import { UploadMaterialDialog } from "../components/UploadMaterialDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import type { MaterialType } from "../api/types";
import styles from "./MarketingKitScreen.module.css";

export function MarketingKitScreen() {
  const { brochures, videos, ads, addMaterial, updateMaterial, deleteMaterial } = useMarketingKit();

  const [expandedSection, setExpandedSection] = useState<MaterialType | "">("brochure");
  const [deleteData, setDeleteData] = useState<{ type: MaterialType | string; id: string } | null>(null);

  // Upload/Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<MaterialType>("brochure");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const openModal = (type: MaterialType, item?: any) => {
    setModalType(type);
    if (item) {
      setEditingItem(item);
      setFormData({ ...item });
    } else {
      setEditingItem(null);
      setFormData({});
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem = {
      ...formData,
      id: editingItem ? editingItem.id : `new-${Date.now()}`,
      fileName: formData.fileName || "Uploaded_File.ext",
      fileSize: formData.fileSize || "1.0 MB"
    };

    if (editingItem) updateMaterial(modalType, editingItem.id, newItem);
    else addMaterial(modalType, newItem);

    setIsModalOpen(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>Marketing Kit & Resources</h2>
          <p className={styles.subtitle}>Manage and download product brochures, demo videos, and ad creatives.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className={styles.btnPrimary} onClick={() => openModal("brochure")}><PlusIcon size={16} /> Upload Material</button>
        </div>
      </div>

      <MaterialAccordion 
        type="brochure"
        title="Product Brochures & Catalogs"
        items={brochures}
        isExpanded={expandedSection === "brochure"}
        onToggle={() => setExpandedSection(expandedSection === "brochure" ? "" : "brochure")}
        onEdit={(item) => openModal("brochure", item)}
        onDelete={(id) => setDeleteData({ type: "brochure", id })}
      />

      <MaterialAccordion 
        type="video"
        title="Machine Demo Videos"
        items={videos}
        isExpanded={expandedSection === "video"}
        onToggle={() => setExpandedSection(expandedSection === "video" ? "" : "video")}
        onEdit={(item) => openModal("video", item)}
        onDelete={(id) => setDeleteData({ type: "video", id })}
      />

      <MaterialAccordion 
        type="ad"
        title="Promotional Banners & Ads"
        items={ads}
        isExpanded={expandedSection === "ad"}
        onToggle={() => setExpandedSection(expandedSection === "ad" ? "" : "ad")}
        onEdit={(item) => openModal("ad", item)}
        onDelete={(id) => setDeleteData({ type: "ad", id })}
      />

      <UploadMaterialDialog 
        isOpen={isModalOpen}
        isEditing={!!editingItem}
        type={modalType}
        form={formData}
        onFormChange={(updates) => setFormData((prev: any) => ({ ...prev, ...updates }))}
        onTypeChange={setModalType}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />

      <ConfirmDeleteModal 
        isOpen={!!deleteData} 
        onCancel={() => setDeleteData(null)} 
        onConfirm={() => { if (deleteData) { deleteMaterial(deleteData.type, deleteData.id); setDeleteData(null); } }} 
      />
    </div>
  );
}
