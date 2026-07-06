import { KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { resolveNotificationPath } from "../lib/notification-routing";
import { PortalNotificationRecord } from "../types";

type NotificationFilter = "ALL" | "UNREAD" | "APPOINTMENT" | "MESSAGE" | "REPORT" | "REFERRAL";

const notificationFilters: Array<{ value: NotificationFilter; label: string }> = [
  { value: "ALL", label: "الكل" },
  { value: "UNREAD", label: "غير المقروءة" },
  { value: "APPOINTMENT", label: "المواعيد" },
  { value: "MESSAGE", label: "الرسائل" },
  { value: "REPORT", label: "التقارير" },
  { value: "REFERRAL", label: "الإحالات" }
];

const financialNotificationTerms = [
  "subscription",
  "subscribed",
  "invoice",
  "payment",
  "paid",
  "billing",
  "bill",
  "price",
  "pricing",
  "plan activated",
  "subscription activated",
  "اشتراك",
  "الاشتراك",
  "فاتورة",
  "فواتير",
  "دفع",
  "دفعة",
  "سداد",
  "مدفوع",
  "السعر",
  "سعر",
  "شيكل",
  "شاقل",
  "₪"
];

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

function notificationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    APPOINTMENT: "موعد",
    MESSAGE: "رسالة",
    REPORT: "تقرير",
    REFERRAL: "إحالة",
    VISIT: "زيارة",
    MEDICAL_RECORD: "السجل الطبي",
    FOLLOW_UP: "متابعة طبية"
  };

  return labels[type] ?? toArabicLabel(type);
}

function isFinancialPatientNotification(notification: PortalNotificationRecord) {
  const haystack = `${notification.type} ${notification.title} ${notification.body}`.toLowerCase();

  return financialNotificationTerms.some((term) => haystack.includes(term.toLowerCase()));
}

function cleanPatientNotifications(notifications: PortalNotificationRecord[]) {
  return notifications.filter((notification) => !isFinancialPatientNotification(notification));
}

function notifyBadgeUpdated() {
  window.dispatchEvent(new Event("healthcare-notifications-updated"));
}

export function PatientNotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PortalNotificationRecord[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNotifications() {
    setLoading(true);
    setError("");

    try {
      const payload = await apiRequest<PortalNotificationRecord[]>("/portal/notifications");
      setNotifications(cleanPatientNotifications(payload));
      notifyBadgeUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الإشعارات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  const filteredNotifications = useMemo(() => {
    if (filter === "ALL") {
      return notifications;
    }

    if (filter === "UNREAD") {
      return notifications.filter((notification) => !notification.isRead);
    }

    return notifications.filter((notification) => notification.type === filter);
  }, [filter, notifications]);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  async function markAsRead(notificationId: string) {
    const previous = notifications;

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification
      )
    );
    notifyBadgeUpdated();

    try {
      await apiRequest(`/portal/notifications/${notificationId}/read`, {
        method: "PATCH"
      });
    } catch (cause) {
      setNotifications(previous);
      setError(cause instanceof Error ? cause.message : "تعذر تعليم الإشعار كمقروء.");
      notifyBadgeUpdated();
    }
  }

  async function openNotification(notification: PortalNotificationRecord) {
    const target = resolveNotificationPath({
      role: user?.role,
      workspace: user?.workspace,
      type: notification.type,
      title: notification.title,
      body: notification.body
    });

    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    if (target !== "/notifications") {
      navigate(target);
    }
  }

  async function handleMarkAsRead(event: MouseEvent<HTMLButtonElement>, notificationId: string) {
    event.stopPropagation();
    await markAsRead(notificationId);
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل الإشعارات...</div>;
  }

  return (
    <div className="page-stack patient-notifications-page">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">الإشعارات والتنبيهات</p>
          <h1>كل ما يستجد على ملفك الطبي</h1>
          <p className="muted">الإشعارات غير المقروءة حاليًا: {unreadCount}</p>
        </div>
      </section>

      <section className="section-card">
        <div className="chip-row">
          {notificationFilters.map((option) => (
            <button
              className={filter === option.value ? "primary-button" : "ghost-button"}
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="error-banner">
            {error}
            <button className="ghost-button" type="button" onClick={() => void loadNotifications()}>
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        <div className="stack-list">
          {filteredNotifications.map((notification) => (
            <article
              key={notification.id}
              className={`stack-item interactive-card ${notification.isRead ? "" : "is-unread"}`}
              role="button"
              tabIndex={0}
              onClick={() => void openNotification(notification)}
              onKeyDown={(event) => {
                if (isActivationKey(event)) {
                  event.preventDefault();
                  void openNotification(notification);
                }
              }}
            >
              <div className="section-header">
                <div>
                  <p className="eyebrow">{notificationTypeLabel(notification.type)}</p>
                  <h3>{notification.title}</h3>
                </div>
                {!notification.isRead ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={(event) => void handleMarkAsRead(event, notification.id)}
                  >
                    تعليم كمقروء
                  </button>
                ) : (
                  <span className="tag">مقروء</span>
                )}
              </div>
              <p>{notification.body}</p>
              <div className="tile-stats">
                <span>{formatDateTime(notification.createdAt)}</span>
                <span>{notification.isRead ? "مقروء" : "غير مقروء"}</span>
              </div>
            </article>
          ))}
          {filteredNotifications.length === 0 ? (
            <div className="empty-state compact">لا توجد إشعارات ضمن هذا التصنيف.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
