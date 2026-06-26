import { type CSSProperties, type WheelEvent as ReactWheelEvent, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { TableEnhancer } from "../components/TableEnhancer";
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
};

function BellIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 17a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

function userInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function AppShell() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState<SidebarAlert[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [contentZoom, setContentZoom] = useState(0.9);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const path = user.workspace === "central" ? "/central/notifications" : "/center/notifications";

    apiRequest<CentralNotificationsBundle | CenterNotificationsBundle>(path)
      .then((payload) => {
        if (user.workspace === "central") {
          const centralPayload = payload as CentralNotificationsBundle;
          const nextAlerts = [
            ...centralPayload.outgoing.map((item) => ({
              id: `out-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: joinMeta([item.targetCenter.centerName, item.targetCenter.centerCode, "صادر"]),
              status: item.status,
              createdAt: item.createdAt
            })),
            ...centralPayload.incoming.map((item) => ({
              id: `in-${item.id}`,
              title: toArabicLabel(item.notificationType),
              helper: joinMeta([item.fromCenter.centerName, item.fromCenter.centerCode, "وارد"]),
              status: item.status,
              createdAt: item.receivedAt
            }))
          ]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 12);

          setAlerts(nextAlerts);
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
          ].slice(0, 12)
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

  useEffect(() => {
    if (!showAccountMenu) {
      return;
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowAccountMenu(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showAccountMenu]);

  if (loading) {
    return <div className="screen-center">جاري تحميل مساحة العمل...</div>;
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

  function stopNotificationScroll(event: ReactWheelEvent<HTMLElement>) {
    event.stopPropagation();
  }

  const visibleNavigation = navigationItems.filter(
    (item) => item.roles.includes(user.role) && systemConfig.allowedRoutes.includes(item.to)
  );
  const currentNavigationItem =
    visibleNavigation
      .filter((item) => (item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? visibleNavigation[0];
  const isNestedPage = Boolean(currentNavigationItem && location.pathname !== currentNavigationItem.to);
  const unreadCount = alerts.filter((alert) =>
    ["PENDING", "FAILED", "PROCESSING", "WARNING", "ERROR", "pending", "failed"].includes(alert.status)
  ).length;
  const badgeCount = unreadCount || alerts.length;
  const accountRows = ([
    ["الاسم", user.fullName],
    ["الدور", toArabicLabel(user.role)],
    ["البريد الإلكتروني", user.email],
    ["المركز", user.center?.name],
    ["اسم المستخدم", user.username]
  ] as Array<[string, string | null | undefined]>).filter((row): row is [string, string] => Boolean(row[1]));

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
              className={({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="account-menu-wrap" ref={accountMenuRef}>
          <button
            className="account-button"
            type="button"
            aria-expanded={showAccountMenu}
            onClick={() => setShowAccountMenu((current) => !current)}
          >
            <span className="account-avatar">{userInitials(user.fullName)}</span>
            <span>حسابي</span>
          </button>
          {showAccountMenu ? (
            <div className="account-menu" role="menu">
              <div className="account-menu-header">
                <span className="account-avatar">{userInitials(user.fullName)}</span>
                <div>
                  <strong>{user.fullName}</strong>
                  <span>{toArabicLabel(user.role)}</span>
                </div>
              </div>
              <dl className="account-details">
                {accountRows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <button className="ghost-button account-logout-button" onClick={logout} type="button">
                تسجيل الخروج
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <button
            className="ghost-button dashboard-return-button"
            type="button"
            aria-label="العودة إلى لوحة المتابعة"
            title="العودة إلى لوحة المتابعة"
            onClick={() => navigate("/", { replace: true })}
          >
            ←
          </button>

          <div className="topbar-notification-wrap">
            <button
              className={showNotifications ? "topbar-icon-button active" : "topbar-icon-button"}
              type="button"
              aria-expanded={showNotifications}
              aria-label="فتح الإشعارات"
              title="الإشعارات"
              onClick={() => setShowNotifications((current) => !current)}
            >
              <BellIcon />
              {badgeCount > 0 ? <span className="topbar-badge">{badgeCount}</span> : null}
            </button>

            {showNotifications ? (
              <aside className="notification-dropdown" onWheel={stopNotificationScroll}>
                <div className="notification-header">
                  <div>
                    <p className="eyebrow">الإشعارات</p>
                    <h3>آخر إشعارات النظام</h3>
                  </div>
                  <button
                    className="ghost-button modal-close-button"
                    type="button"
                    aria-label="إغلاق الإشعارات"
                    onClick={() => setShowNotifications(false)}
                  >
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
                  {alerts.length === 0 ? (
                    <div className="empty-state compact">لا توجد إشعارات حاليًا</div>
                  ) : null}
                </div>

                <div className="notification-dropdown-footer">
                  <Link className="ghost-button" to="/notifications" onClick={() => setShowNotifications(false)}>
                    فتح مركز الإشعارات
                  </Link>
                </div>
              </aside>
            ) : null}
          </div>

          <div>
            <p className="eyebrow">{systemConfig.dashboardLabel}</p>
            <h2>{user.workspace === "central" ? "النظام المركزي" : user.center?.name}</h2>
          </div>
          <div className="topbar-chip">
            <span>{user.username}</span>
          </div>
        </header>

        <div className="content-grid" style={{ "--content-zoom": contentZoom } as CSSProperties} onWheel={handleContentWheel}>
          <section className="page-panel">
            <nav className="breadcrumbs" aria-label="مسار الصفحة">
              <Link to="/">الرئيسية</Link>
              {currentNavigationItem && currentNavigationItem.to !== "/" ? (
                <>
                  <span aria-hidden="true">/</span>
                  <Link to={currentNavigationItem.to}>{currentNavigationItem.label}</Link>
                </>
              ) : null}
              {isNestedPage ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span>تفاصيل</span>
                </>
              ) : null}
            </nav>
            <TableEnhancer />
            <Outlet />
          </section>
        </div>
      </main>
    </div>
  );
}
