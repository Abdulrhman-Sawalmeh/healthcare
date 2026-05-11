import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";

import { apiRequest } from "../api/client";
import { systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { navigationItems } from "../data/navigation";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterNotificationsBundle, CentralNotificationsBundle } from "../types";

type SidebarAlert = {
  id: string;
  title: string;
  helper: string;
  status: string;
  createdAt: string;
  to: string;
};

function buildPath(path: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const [alerts, setAlerts] = useState<SidebarAlert[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const path = user.workspace === "central" ? "/central/notifications" : "/center/notifications";

    apiRequest<CentralNotificationsBundle | CenterNotificationsBundle>(path)
      .then((payload) => {
        if (user.workspace === "central") {
          const centralPayload = payload as CentralNotificationsBundle;
          setAlerts(
            centralPayload.outgoing.slice(0, 5).map((item) => ({
              id: `out-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: item.targetCenter.centerName,
              status: item.status,
              createdAt: item.createdAt,
              to: buildPath("/notifications", {
                view: "outgoing",
                status: item.status,
                type: item.notificationType,
                centerCode: item.targetCenter.centerCode
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
              to: "/notifications"
            })),
            ...centerPayload.outgoing.map((item) => ({
              id: `out-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: `المحاولات ${item.retryCount}/${item.maxRetries}`,
              status: item.status,
              createdAt: item.createdAt,
              to: buildPath("/notifications", {
                view: "outgoing",
                status: item.status,
                type: item.notificationType
              })
            }))
          ].slice(0, 5)
        );
      })
      .catch(() => {
        setAlerts([]);
      });
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

  return (
    <div className="app-shell">
      <div className="background-veil background-veil-a" />
      <div className="background-veil background-veil-b" />

      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">{systemConfig.name}</p>
          <h1>{user.workspace === "central" ? systemConfig.shortName : user.center?.name}</h1>
          <p className="muted">
            {user.workspace === "central"
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
              {item.label}
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
            <p className="eyebrow">{systemConfig.dashboardLabel}</p>
            <h2>{user.workspace === "central" ? "منظومة التنسيق والإشراف المركزية" : user.center?.name}</h2>
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
                <Link key={alert.id} className="notification-card interactive-card" to={alert.to}>
                  <div className="notification-pill">{toArabicLabel(alert.status)}</div>
                  <h4>{alert.title}</h4>
                  <p>{alert.helper}</p>
                  <span className="action-hint">فتح الإشعار المرتبط</span>
                  <span>{formatDateTime(alert.createdAt)}</span>
                </Link>
              ))}
              {alerts.length === 0 ? <div className="empty-state">لا توجد إشعارات حاليًا.</div> : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
