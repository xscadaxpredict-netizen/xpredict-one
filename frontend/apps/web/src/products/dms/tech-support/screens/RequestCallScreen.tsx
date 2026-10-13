import { useState } from "react";
import { useParams } from "react-router-dom";
import { PlusIcon } from "lucide-react";
import { CallRequestTable } from "../components/CallRequestTable";
import { CallRequestDialog } from "../components/CallRequestDialog";
import { CallDetailDialog } from "../components/CallDetailDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import { useTechSupport } from "../api/techSupport";
import { useMe } from "../../../../shell/hooks/useAuth";
import type { RequestCall } from "../api/types";
import styles from "./RequestCallScreen.module.css";

export function RequestCallScreen() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { data: me } = useMe();
  const {
    calls = [],
    createCall,
    updateCall,
    deleteCall,
  } = useTechSupport(orgSlug!);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewCall, setViewCall] = useState<RequestCall | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<RequestCall>>({});

  const handleUpdateStatus = (id: string, status: RequestCall["status"]) => {
    updateCall({ id, status });
    if (viewCall?.id === id) {
      setViewCall({ ...viewCall, status });
    }
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteCall(deleteId);
      if (viewCall?.id === deleteId) {
        setViewCall(null);
      }
      setDeleteId(null);
    }
  };

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const userName = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || me?.email || "Support Request";
    const userEmail = me?.email || "";

    const data = new FormData();
    data.append("name", formData.name || userName);
    data.append("phone", formData.phone || "");
    data.append("email", formData.email || userEmail);
    data.append("subject", formData.subject || (formData.message ? formData.message.slice(0, 60) : "Callback Request"));
    data.append("message", formData.message || "");
    data.append("status", "PENDING");

    if ((formData as any).attachment instanceof File) {
      data.append("attachment", (formData as any).attachment);
    }

    createCall(data as any);

    setIsModalOpen(false);
    setFormData({});
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.title}>Request Tech Support Call</h2>
          <p className={styles.subtitle}>Log an issue and our engineering team will call you back shortly.</p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => {
            setFormData({});
            setIsModalOpen(true);
          }}
        >
          <PlusIcon size={16} /> Request Callback
        </button>
      </div>

      <CallRequestTable
        calls={calls}
        onView={setViewCall}
        onUpdateStatus={handleUpdateStatus}
        onDelete={setDeleteId}
      />

      <CallRequestDialog
        isOpen={isModalOpen}
        form={formData}
        onFormChange={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
        onSubmit={handleSubmitRequest}
        onClose={() => setIsModalOpen(false)}
      />

      <CallDetailDialog
        isOpen={!!viewCall}
        call={viewCall}
        onUpdateStatus={handleUpdateStatus}
        onClose={() => setViewCall(null)}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
