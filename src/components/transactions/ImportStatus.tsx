"use client";

interface ImportStatusProps {
  status: "idle" | "uploading" | "success" | "error";
  message?: string;
}

export default function ImportStatus({ status, message }: ImportStatusProps) {
  if (status === "idle") return null;

  const styles = {
    uploading: "bg-accent/10 border-accent/30 text-accent-light",
    success: "bg-on-track/10 border-on-track/30 text-on-track",
    error: "bg-over-budget/10 border-over-budget/30 text-over-budget",
  };

  return (
    <div className={`rounded-lg border px-4 py-2 text-sm ${styles[status]}`}>
      {status === "uploading" && "Importing..."}
      {status === "success" && (message || "Import complete")}
      {status === "error" && (message || "Import failed")}
    </div>
  );
}
