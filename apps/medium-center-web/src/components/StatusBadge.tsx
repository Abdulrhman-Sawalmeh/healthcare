import { toArabicLabel } from "../lib/arabic";

interface StatusBadgeProps {
  status: string;
}

function statusClass(status: string) {
  const value = status.toLowerCase();

  if (
    [
      "completed",
      "paid",
      "active",
      "accepted",
      "confirmed",
      "connected",
      "available",
      "success",
      "receiving_manager_accepted",
      "visit_created"
    ].includes(value)
  ) {
    return "success";
  }

  if (
    [
      "pending",
      "scheduled",
      "in_progress",
      "past_due",
      "warning",
      "syncing",
      "requested",
      "auto_selected",
      "pending_receiving_manager",
      "assigned_to_doctor"
    ].includes(value)
  ) {
    return "warning";
  }

  if (
    [
      "cancelled",
      "rejected",
      "failed",
      "no_show",
      "expired",
      "error",
      "suspended",
      "permanent_failure",
      "receiving_manager_rejected",
      "no_candidate_rejected",
      "returned_with_reason"
    ].includes(value)
  ) {
    return "danger";
  }

  return "neutral";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${statusClass(status)}`}>{toArabicLabel(status)}</span>;
}
