import { type CSSProperties, type WheelEvent as ReactWheelEvent, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { TableEnhancer } from "../components/TableEnhancer";
import { systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
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
  isRead?: boolean;
  markReadPath?: string;
};

function BellIcon() {
  return (
    <svg aria-hidden="true" className="bell-icon" focusable="false" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState<SidebarAlert[]>([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [contentZoom, setContentZoom] = useState(0.9);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      setAlerts([]);
      setUnreadMessageCount(0);
      setNotificationBadgeCount(0);
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
          setNotificationBadgeCount(notifications.filter((item) => !item.isRead).length);
          setAlerts(
            notifications.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.title,
              helper: item.body,
              status: item.type,
              createdAt: item.createdAt,
              isRead: item.isRead,
              to: resolveNotificationPath({
                role: currentUser.role,
                workspace: currentUser.workspace,
                type: item.type,
                title: item.title,
                body: item.body,
                targetUrl: item.targetUrl
              }),
              markReadPath: `/portal/notifications/${item.id}/read`
            }))
          );
          return;
        }

        if (currentUser.role === "DOCTOR" && currentUser.workspace === "center") {
          const [centerPayloadResult, threadsResult, notificationsResult] = await Promise.allSettled([
            apiRequest<CenterNotificationsBundle>("/center/notifications"),
            apiRequest<PortalThreadRecord[]>("/portal/communications/threads"),
            apiRequest<PortalNotificationRecord[]>("/portal/notifications")
          ]);

          if (!isActive) {
            return;
          }

          if (centerPayloadResult.status === "rejected" && threadsResult.status === "rejected") {
            throw centerPayloadResult.reason;
          }

          const threads = threadsResult.status === "fulfilled" ? threadsResult.value : [];
          const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value : [];
          const summary = summarizeUnreadMessages(threads, currentUser.role);
          const personalAlerts: SidebarAlert[] = notifications.slice(0, 5).map((item) => ({
            id: item.id,
            title: item.title,
            helper: item.body,
            status: item.type,
            createdAt: item.createdAt,
            isRead: item.isRead,
            to: resolveNotificationPath({
              role: currentUser.role,
              workspace: currentUser.workspace,
              type: item.type,
              title: item.title,
              body: item.body,
              targetUrl: item.targetUrl
            }),
            markReadPath: `/portal/notifications/${item.id}/read`
          }));
          const centerAlerts: SidebarAlert[] = [
            ...(centerPayloadResult.status === "fulfilled"
              ? centerPayloadResult.value.alerts.map((alert) => ({
                  id: `alert-${alert.id}`,
                  title: alert.title,
                  helper: alert.message,
                  status: alert.severity,
                  createdAt: alert.createdAt,
                  isRead: alert.isResolved,
                  markReadPath: `/center/notifications/${alert.id}/read`,
                  to: resolveNotificationPath({
                    role: currentUser.role,
                    workspace: currentUser.workspace,
                    type: alert.severity,
                    title: alert.title,
                    body: alert.message,
                    targetUrl: alert.targetUrl
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
          setNotificationBadgeCount(
            notifications.filter((item) => !item.isRead).length +
              centerAlerts.filter((item) => !item.isRead).length +
              (summary.unreadMessages > 0 ? 1 : 0)
          );
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
              ...personalAlerts,
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
          setNotificationBadgeCount(centralPayload.outgoing.length);
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
        setNotificationBadgeCount(
          centerPayload.alerts.filter((alert) => !alert.isResolved).length + centerPayload.outgoing.length
        );
        setAlerts(
          [
            ...centerPayload.alerts.map((alert) => ({
              id: `alert-${alert.id}`,
              title: alert.title,
              helper: alert.message,
              status: alert.severity,
              createdAt: alert.createdAt,
              isRead: alert.isResolved,
              markReadPath: `/center/notifications/${alert.id}/read`,
                to: resolveNotificationPath({
                  role: currentUser.role,
                  workspace: currentUser.workspace,
                  type: alert.severity,
                  title: alert.title,
                  body: alert.message,
                  targetUrl: alert.targetUrl
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
        setNotificationBadgeCount(0);
        setAlerts([]);
      }
    }

    void loadAlerts();

    const intervalId = window.setInterval(() => {
      void loadAlerts();
    }, 30000);
    const handleNotificationsUpdated = () => {
      void loadAlerts();
    };

    window.addEventListener("healthcare-notifications-updated", handleNotificationsUpdated);

    return () => {
      isActive = false;
      window.removeEventListener("healthcare-notifications-updated", handleNotificationsUpdated);
      window.clearInterval(intervalId);
    };
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

  const labNavigationOrder = ["/", "/lab", "/notifications"];
  const pharmacyNavigationOrder = [
    "/",
    "/pharmacy/prescriptions",
    "/pharmacy/dispensing",
    "/pharmacy/inventory",
    "/prescription-verification",
    "/pharmacy/notifications",
    "/pharmacy/audit"
  ];
  const visibleNavigation = navigationItems
    .filter((item) => item.roles.includes(user.role) && systemConfig.allowedRoutes.includes(item.to))
    .filter((item) => user.role !== "LAB_TECH" || labNavigationOrder.includes(item.to))
    .filter((item) => user.role !== "PHARMACIST" || pharmacyNavigationOrder.includes(item.to))
    .sort((first, second) =>
      user.role === "LAB_TECH"
        ? labNavigationOrder.indexOf(first.to) - labNavigationOrder.indexOf(second.to)
        : user.role === "PHARMACIST"
          ? pharmacyNavigationOrder.indexOf(first.to) - pharmacyNavigationOrder.indexOf(second.to)
        : 0
    );
  const displayNavigation = visibleNavigation.map((item) => {
    if (item.to === "/" && user.role === "LAB_TECH") {
      return { ...item, label: "لوحة المختبر" };
    }

    if (item.to === "/" && user.role === "PHARMACIST") {
      return { ...item, label: "لوحة الصيدلية" };
    }

    return (
    item.to === "/visit-workflow" && user.role === "RECEPTIONIST"
      ? { ...item, label: "تسجيل الوصول وملفات الزيارة" }
      : item
    );
  });
  const currentNavigationItem =
    displayNavigation
      .filter((item) => item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? displayNavigation[0];
  const isNestedPage = Boolean(currentNavigationItem && location.pathname !== currentNavigationItem.to);
  const isPatientPortal = user.role === "PATIENT" || user.workspace === "legacy";
  const accountRows = ([
    ["الاسم", user.fullName],
    ["الدور", toArabicLabel(user.role)],
    ["رقم الهاتف", user.phone],
    ["البريد الإلكتروني", user.email],
    ["التخصص", user.departmentName],
    ["المركز", user.center?.name],
    ["اسم المستخدم", user.username]
  ] as Array<[string, string | null | undefined]>).filter((row): row is [string, string] => Boolean(row[1]));

  async function openSidebarAlert(alert: SidebarAlert) {
    if (alert.markReadPath && !alert.isRead) {
      try {
        await apiRequest(alert.markReadPath, {
          method: "PATCH"
        });
        setAlerts((current) =>
          current.map((item) => (item.id === alert.id ? { ...item, isRead: true } : item))
        );
        setNotificationBadgeCount((current) => Math.max(0, current - 1));
        window.dispatchEvent(new Event("healthcare-notifications-updated"));
      } catch {
        // Navigation should still work even if marking the notification as read fails.
      }
    }

    setShowNotifications(false);
    navigate(alert.to, { replace: true });
  }

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
          {displayNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              replace
              end={item.to === "/"}
              className={({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link")}
            >
              <span>{item.label}</span>
              {item.to === "/messages" && unreadMessageCount > 0 ? (
                <span className="nav-badge">{unreadMessageCount}</span>
              ) : null}
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
            aria-label={t("فتح سجل الإشعارات", "Open notification log")}
            title={t("سجل الإشعارات", "Notification log")}
            onClick={() => setShowNotifications((current) => !current)}
          >
            <BellIcon />
            {notificationBadgeCount > 0 ? <span className="topbar-badge">{notificationBadgeCount}</span> : null}
          </button>
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

        <div className={showNotifications ? "content-grid with-notifications" : "content-grid"} style={{ "--content-zoom": contentZoom } as CSSProperties} onWheel={handleContentWheel}>
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
                <button
                  key={alert.id}
                  className="notification-card notification-card-button interactive-card"
                  type="button"
                  onClick={() => void openSidebarAlert(alert)}
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
          ) : null}
        </div>
      </main>
    </div>
  );
}
