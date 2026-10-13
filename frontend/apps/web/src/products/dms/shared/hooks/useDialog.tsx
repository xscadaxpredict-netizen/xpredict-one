import { useState, useCallback } from "react";
import { AlertCircleIcon, InfoIcon, HelpCircleIcon } from "lucide-react";

type DialogType = "alert" | "confirm" | "prompt";

interface DialogState {
  isOpen: boolean;
  type: DialogType;
  title: string;
  message: string;
  defaultValue?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}

export function useDialog() {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: "alert",
    title: "",
    message: "",
  });

  const [inputValue, setInputValue] = useState("");

  const showAlert = useCallback((title: string, message: string) => {
    return new Promise<void>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "alert",
        title,
        message,
        onConfirm: () => resolve(),
      });
    });
  }, []);

  const showConfirm = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "confirm",
        title,
        message,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, []);

  const showPrompt = useCallback((title: string, message: string, defaultValue: string = "") => {
    return new Promise<string | null>((resolve) => {
      setInputValue(defaultValue);
      setDialogState({
        isOpen: true,
        type: "prompt",
        title,
        message,
        defaultValue,
        onConfirm: (val) => resolve(val || ""),
        onCancel: () => resolve(null),
      });
    });
  }, []);

  const handleClose = () => {
    if (dialogState.onCancel) dialogState.onCancel();
    else if (dialogState.onConfirm) dialogState.onConfirm();
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleConfirm = () => {
    if (dialogState.onConfirm) {
      if (dialogState.type === "prompt") dialogState.onConfirm(inputValue);
      else dialogState.onConfirm();
    }
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  };

  const DialogComponent = () => {
    if (!dialogState.isOpen) return null;

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={handleClose}>
        <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {dialogState.type === 'alert' ? <InfoIcon size={24} style={{ color: '#3b82f6' }} /> :
             dialogState.type === 'confirm' ? <HelpCircleIcon size={24} style={{ color: '#f59e0b' }} /> :
             <AlertCircleIcon size={24} style={{ color: '#2563eb' }} />}
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{dialogState.title}</h3>
          </div>
          
          <div style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.5 }}>
            {dialogState.message}
          </div>

          {dialogState.type === "prompt" && (
            <input 
              autoFocus
              type="text" 
              value={inputValue} 
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none' }} 
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            {dialogState.type !== "alert" && (
              <button 
                type="button"
                onClick={handleClose}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#334155', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}
              >
                Cancel
              </button>
            )}
            <button 
              type="button"
              onClick={handleConfirm}
              style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#2563eb', color: 'white', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}
            >
              {dialogState.type === "alert" ? "OK" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return {
    showAlert,
    showConfirm,
    showPrompt,
    DialogComponent
  };
}
