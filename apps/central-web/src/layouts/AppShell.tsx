import { type CSSProperties, type WheelEvent as ReactWheelEvent, useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { navigationItems } from "../data/navigation";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterNotificationsBundle, CentralNotificationsBundle } from "../types";

type SidebarAlert = {
  id: string;
  title: string;
  helper: string;
  status: string;
  createdAt: string;
};

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<SidebarAlert[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [contentZoom, setContentZoom] = useState(0.9);

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
              createdAt: item.createdAt
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
              createdAt: alert.createdAt
            })),
            ...centerPayload.outgoing.map((item) => ({
              id: `out-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: `المحاولات ${item.retryCount}/${item.maxRetries}`,
              status: item.status,
              createdAt: item.createdAt
            }))
          ].slice(0, 5)
        );
      })
      .catch(() => {
        setAlerts([]);
      });
  }, [user]);

  useEffect(() => {
    function blockBrowserZoom(event: WheelEvent) {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    }

    function blockBrowserZoomKeys(event: KeyboardEvent) {
      const isZoomShortcut =
        (event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key);

      if (isZoomShortcut) {
        event.preventDefault();
      }
    }

    window.addEventListener("wheel", blockBrowserZoom, { passive: false, capture: true });
    window.addEventListener("keydown", blockBrowserZoomKeys, { capture: true });

    return () => {
      window.removeEventListener("wheel", blockBrowserZoom, { capture: true });
      window.removeEventListener("keydown", blockBrowserZoomKeys, { capture: true });
    };
  }, []);
  if (loading) {
    return <div className="screen-center">جارٍ تحميل مساحة العمل...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  function handleContentWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const zoomStep = event.deltaY < 0 ? 0.05 : -0.05;
    setContentZoom((current) =>
      Math.min(1.3, Math.max(0.8, Number((current + zoomStep).toFixed(2))))
    );
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
              replace
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
          <button
            className="ghost-button dashboard-return-button"
            type="button"
            aria-label="Return to dashboard"
            title="Return to dashboard"
            onClick={() => navigate("/", { replace: true })}
          >
            ←
          </button>
          <button
            className={showNotifications ? "topbar-icon-button active" : "topbar-icon-button"}
            type="button"
            aria-expanded={showNotifications}
            aria-label={t("��� ��� ���������", "Open notification log")}
            title={t("��� ���������", "Notification log")}
            onClick={() => setShowNotifications((current) => !current)}
          >
            <span className="sidebar-icon-mark">!</span>
            {alerts.length > 0 ? <span className="topbar-badge">{alerts.length}</span> : null}
          </button>
          <div>
            <p className="eyebrow">{t(systemConfig.dashboardLabel, "")}</p>
            <h2>{user.workspace === "central" ? "" : user.center?.name}</h2>
          </div>
          <div className="topbar-chip">
            <span>{user.username}</span>
          </div>
        </header>

        <div className={showNotifications ? "content-grid with-notifications" : "content-grid"} style={{ "--content-zoom": contentZoom } as CSSProperties} onWheel={handleContentWheel}>
          <section className="page-panel">
            <Outlet />
          </section>

          {showNotifications ? (
          <aside className="notification-panel">
            <div className="notification-header">
              <div>
                <p className="eyebrow">{systemConfig.feedLabel}</p>
                <h3>{systemConfig.feedTitle}</h3>
              </div>
              <button className="ghost-button panel-close-button" type="button" onClick={() => setShowNotifications(false)}>
                ×
              </button>
            </div>
            <div className="notification-list">
              {alerts.map((alert) => (
                <article key={alert.id} className="notification-card">
                  <div className="notification-pill">{toArabicLabel(alert.status)}</div>
                  <h4>{alert.title}</h4>
                  <p>{alert.helper}</p>
                  <span>{formatDateTime(alert.createdAt)}</span>
                </article>
              ))}
              {alerts.length === 0 ? <div className="empty-state">لا توجد إشعارات حاليًا.</div> : null}
            </div>
          </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}
