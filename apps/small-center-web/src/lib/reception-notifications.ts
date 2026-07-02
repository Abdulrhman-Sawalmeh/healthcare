import { CenterNotificationsBundle, Role, Workspace } from "../types";
import { resolveNotificationPath } from "./notification-routing";

export type ReceptionNotificationView = "action" | "visits" | "patients" | "sync" | "recent";

export const receptionNotificationViews: Array<{ value: ReceptionNotificationView; label: string }> = [
  { value: "action", label: "تحتاج إجراء" },
  { value: "visits", label: "الزيارات والطابور" },
  { value: "patients", label: "المرضى" },
  { value: "sync", label: "المزامنة" },
  { value: "recent", label: "الأحدث" }
];

const restrictedReceptionTerms = [
  "REFERRAL",
  "PRESCRIPTION",
  "PHARMACY",
  "LAB",
  "REPORT",
  "RESULT",
  "INVOICE",
  "إحالة",
  "احالة",
  "وصفة",
  "صيدلية",
  "مختبر",
  "تقرير",
  "نتيجة",
  "فاتورة"
];

const receptionTerms = [
  "PATIENT",
  "VISIT",
  "QUEUE",
  "SYNC",
  "SMS",
  "EMAIL",
  "ACCOUNT",
  "WAITING_RECEPTION",
  "WAITING_DOCTOR",
  "مريض",
  "مرضى",
  "زيارة",
  "زيارات",
  "طابور",
  "استقبال",
  "طبيب",
  "مزامنة",
  "رسالة",
  "بريد",
  "حساب",
  "هاتف",
  "انتظار"
];

function searchable(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").toUpperCase();
}

function hasAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term.toUpperCase()));
}

function alertText(alert: CenterNotificationsBundle["alerts"][number]) {
  return searchable([alert.alertType, alert.severity, alert.title, alert.message, alert.targetUrl]);
}

function outgoingText(item: CenterNotificationsBundle["outgoing"][number]) {
  return searchable([item.notificationType, item.status, item.lastError]);
}

export function isReceptionRelevantText(text: string) {
  if (hasAny(text, restrictedReceptionTerms)) {
    return false;
  }

  return hasAny(text, receptionTerms);
}

function matchesReceptionView(
  view: ReceptionNotificationView,
  text: string,
  status: string,
  isResolved = false
) {
  if (view === "action") {
    return !isResolved && status !== "COMPLETED";
  }

  if (view === "visits") {
    return hasAny(text, ["VISIT", "QUEUE", "WAITING_RECEPTION", "WAITING_DOCTOR", "زيارة", "طابور", "طبيب"]);
  }

  if (view === "patients") {
    return hasAny(text, ["PATIENT", "ACCOUNT", "SMS", "EMAIL", "مريض", "مرضى", "حساب", "رسالة", "بريد"]);
  }

  if (view === "sync") {
    return hasAny(text, ["SYNC", "SENT", "PENDING", "PROCESSING", "FAILED", "مزامنة"]);
  }

  return true;
}

export function filterReceptionAlerts(
  alerts: CenterNotificationsBundle["alerts"],
  view: ReceptionNotificationView = "recent"
) {
  return alerts.filter((alert) => {
    const text = alertText(alert);
    return isReceptionRelevantText(text) && matchesReceptionView(view, text, alert.isResolved ? "COMPLETED" : "PENDING", alert.isResolved);
  });
}

export function filterReceptionOutgoing(
  outgoing: CenterNotificationsBundle["outgoing"],
  view: ReceptionNotificationView = "recent"
) {
  return outgoing.filter((item) => {
    const text = outgoingText(item);
    return isReceptionRelevantText(text) && matchesReceptionView(view, text, item.status);
  });
}

export function countReceptionActionItems(bundle: CenterNotificationsBundle) {
  return (
    filterReceptionAlerts(bundle.alerts, "action").length +
    filterReceptionOutgoing(bundle.outgoing, "action").length
  );
}

export function resolveReceptionNotificationPath(input: {
  role?: Role;
  workspace?: Workspace;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  targetUrl?: string | null;
}) {
  return resolveNotificationPath({
    ...input,
    role: input.role ?? "RECEPTIONIST",
    workspace: input.workspace ?? "center"
  });
}
