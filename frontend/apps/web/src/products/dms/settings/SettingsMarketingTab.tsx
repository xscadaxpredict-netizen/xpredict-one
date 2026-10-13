import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useMarketingKit } from "../tools/hooks/useMarketingKit";
import { MaterialAccordion } from "../tools/components/MaterialAccordion";
import { UploadMaterialDialog } from "../tools/components/UploadMaterialDialog";
import { ConfirmDeleteModal } from "../../../shell/components/ConfirmDeleteModal";
import type { MaterialType } from "../tools/api/types";
import styles from "./SettingsPage.module.css";

export function SettingsMarketingTab() {
  const { brochures, videos, ads, addMaterial, updateMaterial, deleteMaterial } = useMarketingKit();

  const [expandedSection, setExpandedSection] = useState<MaterialType | "">("brochure");
  const [deleteData, setDeleteData] = useState<{ type: MaterialType | string; id: string } | null>(null);

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
    const formDataObj = new FormData();
    Object.keys(formData).forEach(key => {
        if (key !== "file") formDataObj.append(key, (formData as any)[key]);
    });
    formDataObj.append("material_type", modalType.toUpperCase());
    
    if (formData.file && (formData.file as any).length > 0) formDataObj.append("file", (formData.file as any)[0]);
    else if (!editingItem) return alert("Please select a file to upload.");

    if (editingItem) updateMaterial(modalType, editingItem.id, formDataObj);
    else addMaterial(modalType, formDataObj);

    setIsModalOpen(false);
  };

  return (
    <div>
      <div className={styles.sectionHeader} style={{ marginTop: '24px' }}>
        <h2 className={styles.sectionTitle}>Marketing Kit (Tools)</h2>
        <button className={styles.btnPrimary} onClick={() => openModal("brochure")}>
          <PlusIcon size={16} style={{ marginRight: '6px' }} /> Upload Material
        </button>
      </div>

      <div style={{ marginTop: '24px' }}>
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
      </div>

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
