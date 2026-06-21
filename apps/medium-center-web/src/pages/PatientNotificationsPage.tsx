import { KeyboardEvent, MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { resolveNotificationPath } from "../lib/notification-routing";
import { PortalNotificationRecord } from "../types";

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

export function PatientNotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PortalNotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    setLoading(true);
    const payload = await apiRequest<PortalNotificationRecord[]>("/portal/notifications");
    setNotifications(payload);
    setLoading(false);
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function markAsRead(notificationId: string) {
    await apiRequest(`/portal/notifications/${notificationId}/read`, {
      method: "PATCH"
    });

    await loadNotifications();
  }

  async function openNotification(notification: PortalNotificationRecord) {
    const target = resolveNotificationPath({
      role: user?.role,
      workspace: user?.workspace,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      targetUrl: notification.targetUrl
    });

    if (!notification.isRead) {
      await apiRequest(`/portal/notifications/${notification.id}/read`, {
        method: "PATCH"
      });
    }

    if (target === "/notifications") {
      await loadNotifications();
      return;
    }

    navigate(target);
  }

  async function handleMarkAsRead(event: MouseEvent<HTMLButtonElement>, notificationId: string) {
    event.stopPropagation();
    await markAsRead(notificationId);
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل الإشعارات...</div>;
  }

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">الإشعارات والتنبيهات</p>
          <h1>كل ما يستجد على ملفك الطبي</h1>
          <p className="muted">الإشعارات غير المقروءة حاليًا: {unreadCount}</p>
        </div>
      </section>

      <section className="section-card">
        <div className="stack-list">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className="stack-item interactive-card"
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
                  <p className="eyebrow">{toArabicLabel(notification.type)}</p>
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
                ) : null}
              </div>
              <p>{notification.body}</p>
              <div className="tile-stats">
                <span>{formatDateTime(notification.createdAt)}</span>
                <span>{notification.isRead ? "مقروء" : "غير مقروء"}</span>
              </div>
            </article>
          ))}
          {notifications.length === 0 ? <div className="empty-state">لا توجد إشعارات لعرضها.</div> : null}
        </div>
      </section>
    </div>
  );
}
