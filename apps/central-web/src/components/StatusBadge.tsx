import { toArabicLabel } from "../lib/arabic";

interface StatusBadgeProps {
  status: string;
}

function statusClass(status: string) {
  const value = status.toLowerCase();

  if (["completed", "paid", "active", "accepted", "confirmed", "connected", "available", "success"].includes(value)) {
    return "success";
  }

  if (["pending", "scheduled", "in_progress", "past_due", "warning", "syncing"].includes(value)) {
    return "warning";
  }

  if (["cancelled", "rejected", "failed", "no_show", "expired", "error", "suspended", "permanent_failure"].includes(value)) {
    return "danger";
  }

  return "neutral";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${statusClass(status)}`}>{toArabicLabel(status)}</span>;
}
