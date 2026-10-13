import { Loader2 } from "lucide-react";

export function Loading() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: "200px",
      width: "100%",
      color: "var(--color-text-2)",
      gap: "12px",
    }} role="status">
      <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--color-primary)" }} />
      <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>Loading...</span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
