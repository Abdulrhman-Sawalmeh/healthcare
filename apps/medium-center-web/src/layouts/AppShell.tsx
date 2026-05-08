import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { navigationItems } from "../data/navigation";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { resolveNotificationPath } from "../lib/notification-routing";
import {
  CenterNotificationsBundle,
  CentralNotificationsBundle,
  PortalNotificationRecord,
  PortalThreadRecord
} from "../types";

type SidebarAlert = {
  id: string;
  title: string;
  helper: string;
  status: string;
  createdAt: string;
  to: string;
};

function summarizeUnreadMessages(threads: PortalThreadRecord[], currentRole: string) {
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

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SidebarAlert[]>([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentUser = user;
    let isActive = true;

    async function loadAlerts() {
      try {
        if (currentUser.role === "PATIENT" || currentUser.workspace === "legacy") {
          const [notificationsResult, threadsResult] = await Promise.allSettled([
            apiRequest<PortalNotificationRecord[]>("/portal/notifications"),
            apiRequest<PortalThreadRecord[]>("/portal/communications/threads")
          ]);

          if (!isActive) {
            return;
          }

          if (notificationsResult.status === "rejected" && threadsResult.status === "rejected") {
            throw notificationsResult.reason;
          }

          const notifications =
            notificationsResult.status === "fulfilled" ? notificationsResult.value : [];
          const threads = threadsResult.status === "fulfilled" ? threadsResult.value : [];
          const summary = summarizeUnreadMessages(threads, currentUser.role);

          setUnreadMessageCount(summary.unreadMessages);
          setAlerts(
            notifications.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.title,
              helper: item.body,
              status: item.type,
              createdAt: item.createdAt,
              to: resolveNotificationPath({
                role: currentUser.role,
                workspace: currentUser.workspace,
                type: item.type,
                title: item.title,
                body: item.body
              })
            }))
          );
          return;
        }

        if (currentUser.role === "DOCTOR" && currentUser.workspace === "center") {
          const [centerPayloadResult, threadsResult] = await Promise.allSettled([
            apiRequest<CenterNotificationsBundle>("/center/notifications"),
            apiRequest<PortalThreadRecord[]>("/portal/communications/threads")
          ]);

          if (!isActive) {
            return;
          }

          if (centerPayloadResult.status === "rejected" && threadsResult.status === "rejected") {
            throw centerPayloadResult.reason;
          }

          const threads = threadsResult.status === "fulfilled" ? threadsResult.value : [];
          const summary = summarizeUnreadMessages(threads, currentUser.role);
          const centerAlerts: SidebarAlert[] = [
            ...(centerPayloadResult.status === "fulfilled"
              ? centerPayloadResult.value.alerts.map((alert) => ({
                  id: `alert-${alert.id}`,
                  title: alert.title,
                  helper: alert.message,
                  status: alert.severity,
                  createdAt: alert.createdAt,
                  to: resolveNotificationPath({
                    role: currentUser.role,
                    workspace: currentUser.workspace,
                    type: alert.severity,
                    title: alert.title,
                    body: alert.message
                  })
                }))
              : []),
            ...(centerPayloadResult.status === "fulfilled"
              ? centerPayloadResult.value.outgoing.map((item) => ({
                  id: `out-${item.id}`,
                  title: toArabicLabel(item.notificationType),
                  helper: `عدد المحاولات ${item.retryCount}/${item.maxRetries}`,
                  status: item.status,
                  createdAt: item.createdAt,
                  to: resolveNotificationPath({
                    role: currentUser.role,
                    workspace: currentUser.workspace,
                    type: item.notificationType,
                    title: toArabicLabel(item.notificationType),
                    body: item.lastError ?? `عدد المحاولات ${item.retryCount}/${item.maxRetries}`
                  })
                }))
              : [])
          ];

          setUnreadMessageCount(summary.unreadMessages);
          setAlerts(
            [
              ...(summary.unreadMessages > 0
                ? [
                    {
                      id: "doctor-messages",
                      title: "رسائل مرضى جديدة",
                      helper: `لديك ${summary.unreadMessages} رسالة جديدة في ${summary.unreadThreads} محادثات.`,
                      status: "MESSAGE",
                      createdAt: summary.latestUnreadAt ?? new Date().toISOString(),
                      to: "/messages"
                    }
                  ]
                : []),
              ...centerAlerts
            ].slice(0, 5)
          );
          return;
        }

        const path =
          currentUser.workspace === "central" ? "/central/notifications" : "/center/notifications";
        const payload = await apiRequest<CentralNotificationsBundle | CenterNotificationsBundle>(path);

        if (!isActive) {
          return;
        }

        setUnreadMessageCount(0);

        if (currentUser.workspace === "central") {
          const centralPayload = payload as CentralNotificationsBundle;
          setAlerts(
            centralPayload.outgoing.slice(0, 5).map((item) => ({
              id: `out-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: item.targetCenter.centerName,
              status: item.status,
              createdAt: item.createdAt,
              to: resolveNotificationPath({
                role: currentUser.role,
                workspace: currentUser.workspace,
                type: item.notificationType,
                title: toArabicLabel(item.notificationType),
                body: item.targetCenter.centerName
              })
            }))
          );
          return;
        }

        const centerPayload = payload as CenterNotificationsBundle;
        setAlerts(
          [
            ...centerPayload.alerts.map((alert) => ({
              id: `alert-${alert.id}`,
              title: alert.title,
              helper: alert.message,
              status: alert.severity,
              createdAt: alert.createdAt,
              to: resolveNotificationPath({
                role: currentUser.role,
                workspace: currentUser.workspace,
                type: alert.severity,
                title: alert.title,
                body: alert.message
              })
            })),
            ...centerPayload.outgoing.map((item) => ({
              id: `out-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: `عدد المحاولات ${item.retryCount}/${item.maxRetries}`,
              status: item.status,
              createdAt: item.createdAt,
              to: resolveNotificationPath({
                role: currentUser.role,
                workspace: currentUser.workspace,
                type: item.notificationType,
                title: toArabicLabel(item.notificationType),
                body: item.lastError ?? `عدد المحاولات ${item.retryCount}/${item.maxRetries}`
              })
            }))
          ].slice(0, 5)
        );
      } catch {
        if (!isActive) {
          return;
        }

        setUnreadMessageCount(0);
        setAlerts([]);
      }
    }

    void loadAlerts();

    const intervalId = window.setInterval(() => {
      void loadAlerts();
    }, 30000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [user]);

  if (loading) {
    return <div className="screen-center">جارٍ تحميل مساحة العمل...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const visibleNavigation = navigationItems.filter(
    (item) => item.roles.includes(user.role) && systemConfig.allowedRoutes.includes(item.to)
  );
  const isPatientPortal = user.role === "PATIENT" || user.workspace === "legacy";

  return (
    <div className="app-shell">
      <div className="background-veil background-veil-a" />
      <div className="background-veil background-veil-b" />

      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">{isPatientPortal ? "بوابة المريض" : systemConfig.name}</p>
          <h1>
            {isPatientPortal
              ? user.fullName
              : user.workspace === "central"
                ? systemConfig.shortName
                : user.center?.name}
          </h1>
          <p className="muted">
            {isPatientPortal
              ? "احجز موعدك، راجع سجلك الصحي، تابع إشعاراتك، وتواصل مع طبيبك من مكان واحد."
              : user.workspace === "central"
                ? systemConfig.description
                : "واجهة تشغيل محلية لسير العمل السريري والإداري مع مزامنة مرحلية مع النظام المركزي."}
          </p>
        </div>

        <nav className="sidebar-nav">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              <span>{item.label}</span>
              {item.to === "/messages" && unreadMessageCount > 0 ? (
                <span className="nav-badge">{unreadMessageCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="profile-card">
          <p className="eyebrow">{toArabicLabel(user.role)}</p>
          <h3>{user.fullName}</h3>
          <p className="muted">
            {user.center ? joinMeta([user.center.code, user.center.city]) : user.email ?? "-"}
          </p>
          <button className="ghost-button" onClick={logout} type="button">
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {isPatientPortal ? "متابعة الرعاية الصحية" : systemConfig.dashboardLabel}
            </p>
            <h2>
              {isPatientPortal
                ? user.center?.name ?? "بوابة المريض"
                : user.workspace === "central"
                  ? "منظومة التنسيق والإشراف المركزية"
                  : user.center?.name}
            </h2>
          </div>
          <div className="topbar-chip">
            <span>{user.username}</span>
          </div>
        </header>

        <div className="content-grid">
          <section className="page-panel">
            <Outlet />
          </section>

          <aside className="notification-panel">
            <div className="notification-header">
              <div>
                <p className="eyebrow">{systemConfig.feedLabel}</p>
                <h3>{systemConfig.feedTitle}</h3>
              </div>
            </div>
            <div className="notification-list">
              {alerts.map((alert) => (
                <button
                  key={alert.id}
                  className="notification-card notification-card-button interactive-card"
                  type="button"
                  onClick={() => navigate(alert.to)}
                >
                  <div className="notification-pill">{toArabicLabel(alert.status)}</div>
                  <h4>{alert.title}</h4>
                  <p>{alert.helper}</p>
                  <span>{formatDateTime(alert.createdAt)}</span>
                </button>
              ))}
              {alerts.length === 0 ? <div className="empty-state">لا توجد إشعارات حاليًا.</div> : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
