import { toArabicLabel } from "./arabic";
import { resolveNotificationPath } from "./notification-routing";
import { CenterNotificationsBundle, PortalThreadRecord, Role, Workspace } from "../types";

export type DoctorActionNotification = {
  id: string;
  title: string;
  helper: string;
  status: string;
  createdAt: string;
  to: string;
};

export type DoctorVisitFileNotificationSource = {
  id: number;
  workflowStatus: string;
  visitDate?: string | null;
  checkedInAt?: string | null;
  priority?: string | null;
  patient?: {
    fullName?: string | null;
    phone?: string | null;
  } | null;
};

export function summarizeUnreadMessages(threads: PortalThreadRecord[], currentRole: string) {
  let unreadMessages = 0;
  let unreadThreads = 0;
  let latestUnreadTimestamp = 0;

  for (const thread of threads) {
    const unreadThreadMessages = thread.messages.filter(
      (message) => !message.isRead && message.sender.role !== currentRole
    );

    if (unreadThreadMessages.length === 0) {
      continue;
    }

    unreadMessages += unreadThreadMessages.length;
    unreadThreads += 1;

    for (const message of unreadThreadMessages) {
      const timestamp = new Date(message.createdAt).getTime();

      if (timestamp > latestUnreadTimestamp) {
        latestUnreadTimestamp = timestamp;
      }
    }
  }

  return {
    unreadMessages,
    unreadThreads,
    latestUnreadAt:
      latestUnreadTimestamp > 0 ? new Date(latestUnreadTimestamp).toISOString() : null
  };
}

function isPendingActionStatus(status: string) {
  return status !== "COMPLETED";
}

function isGenericVisitQueueAlert(title: string, message: string) {
  const haystack = `${title} ${message}`;
  return haystack.includes("مريض بانتظار الطبيب") || haystack.includes("جاهزة للتقييم الطبي");
}

export function buildDoctorActionNotifications(input: {
  centerBundle?: CenterNotificationsBundle | null;
  threads?: PortalThreadRecord[];
  visitFiles?: DoctorVisitFileNotificationSource[];
  role?: Role;
  workspace?: Workspace;
}) {
  const centerBundle = input.centerBundle;
  const role = input.role ?? "DOCTOR";
  const workspace = input.workspace ?? "center";
  const threads = input.threads ?? [];
  const visitFiles = input.visitFiles ?? [];
  const messageSummary = summarizeUnreadMessages(threads, role);

  const notifications: DoctorActionNotification[] = [
    ...visitFiles
      .filter((visit) => visit.workflowStatus === "WAITING_DOCTOR")
      .map((visit) => ({
        id: `visit-file-${visit.id}`,
        title: "يوجد ملف زيارة بانتظارك",
        helper: visit.patient?.fullName
          ? `ملف زيارة ${visit.patient.fullName} جاهز للمعالجة.`
          : "يوجد ملف زيارة جاهز للمعالجة.",
        status: visit.priority === "EMERGENCY" ? "URGENT" : "PENDING",
        createdAt: visit.checkedInAt ?? visit.visitDate ?? new Date().toISOString(),
        to: `/visit-workflow?visitId=${visit.id}`
      })),
    ...(messageSummary.unreadMessages > 0
      ? [
          {
            id: "doctor-messages",
            title: "رسائل مرضى جديدة",
            helper: `لديك ${messageSummary.unreadMessages} رسالة جديدة في ${messageSummary.unreadThreads} محادثات.`,
            status: "MESSAGE",
            createdAt: messageSummary.latestUnreadAt ?? new Date().toISOString(),
            to: "/messages"
          }
        ]
      : []),
    ...(centerBundle?.alerts
      .filter((alert) => !alert.isResolved && !isGenericVisitQueueAlert(alert.title, alert.message))
      .map((alert) => ({
        id: `alert-${alert.id}`,
        title: alert.title,
        helper: alert.message,
        status: alert.severity,
        createdAt: alert.createdAt,
        to: resolveNotificationPath({
          role,
          workspace,
          type: alert.severity,
          title: alert.title,
          body: alert.message,
          targetUrl: alert.targetUrl
        })
      })) ?? []),
    ...(centerBundle?.incoming
      .filter((item) => isPendingActionStatus(item.status))
      .map((item) => ({
        id: `in-${item.id}`,
        title: toArabicLabel(item.notificationType),
        helper: item.responseError ?? item.responseStatus ?? "إشعار وارد يحتاج متابعة.",
        status: item.status,
        createdAt: item.receivedAt,
        to: resolveNotificationPath({
          role,
          workspace,
          type: item.notificationType,
          title: toArabicLabel(item.notificationType),
          body: item.responseError ?? item.responseStatus ?? undefined
        })
      })) ?? []),
    ...(centerBundle?.outgoing
      .filter((item) => isPendingActionStatus(item.status))
      .map((item) => ({
        id: `out-${item.id}`,
        title: toArabicLabel(item.notificationType),
        helper: item.lastError ?? `المحاولات ${item.retryCount}/${item.maxRetries}`,
        status: item.status,
        createdAt: item.createdAt,
        to: resolveNotificationPath({
          role,
          workspace,
          type: item.notificationType,
          title: toArabicLabel(item.notificationType),
          body: item.lastError ?? `المحاولات ${item.retryCount}/${item.maxRetries}`
        })
      })) ?? [])
  ];

  return notifications.sort((first, second) => {
    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  });
}
