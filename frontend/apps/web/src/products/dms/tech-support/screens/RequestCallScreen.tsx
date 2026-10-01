import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { CallRequestTable } from "../components/CallRequestTable";
import { CallRequestDialog } from "../components/CallRequestDialog";
import { CallDetailDialog } from "../components/CallDetailDialog";
import { ConfirmDeleteModal } from "../../../../shell/components/ConfirmDeleteModal";
import type { RequestCall } from "../api/types";
import styles from "./RequestCallScreen.module.css";

const INITIAL_CALLS: RequestCall[] = [
  { id: "call-1", name: "Ramesh Kumar", phone: "+91 98765 43210", email: "ramesh@waterco.in", subject: "High pressure pump making abnormal noise", message: "Since yesterday morning, the HPP is making a loud grinding noise. We have stopped the plant.", date: "2026-09-28", status: "PENDING" },
  { id: "call-2", name: "Suresh", phone: "+91 87654 32109", email: "suresh.plant@example.com", subject: "TDS meter calibration", message: "Need help calibrating the online TDS meter on our 2000 LPH RO.", date: "2026-09-27", status: "COMPLETED" },
];

export function RequestCallScreen() {
  const [calls, setCalls] = useState<RequestCall[]>(INITIAL_CALLS);
  
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewCall, setViewCall] = useState<RequestCall | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<RequestCall>>({});

  const handleUpdateStatus = (id: string, status: RequestCall["status"]) => {
    setCalls(calls.map(c => c.id === id ? { ...c, status } : c));
    if (viewCall?.id === id) {
      setViewCall({ ...viewCall, status });
    }
  };

  const handleDelete = () => {
    if (deleteId) {
      setCalls(calls.filter(c => c.id !== deleteId));
      setDeleteId(null);
    }
  };

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const newCall: RequestCall = {
      ...(formData as any),
      id: `call-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      status: "PENDING",
    };
    setCalls([newCall, ...calls]);
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
        <button className={styles.btnPrimary} onClick={() => { setFormData({}); setIsModalOpen(true); }}>
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
        onFormChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
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
