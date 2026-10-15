import { ConfirmDialog } from "@xpredict/ui";

interface Props {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ 
  isOpen, 
  title = "Delete Confirmation", 
  message = "Are you sure you want to delete this? This action cannot be undone and once deleted, the data cannot be restored.", 
  onConfirm, 
  onCancel 
}: Props) {
  return (
    <ConfirmDialog
      open={isOpen}
      title={title}
      message={message}
      intent="danger"
      confirmLabel="Yes, Delete"
      cancelLabel="Cancel"
      onConfirm={() => { onConfirm(); onCancel(); }}
      onCancel={onCancel}
    />
  );
}
