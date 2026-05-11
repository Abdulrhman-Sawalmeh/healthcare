import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { CenterNotificationsBundle, CentralNotificationsBundle } from "../types";

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

function buildNotificationTarget(notificationType: string, centerCode?: string) {
  switch (notificationType) {
    case "REFERRAL_REQUEST":
    case "NOTIFY_REFERRAL":
    case "NOTIFY_REFERRAL_RESPONSE":
      return { to: "/referrals", label: "فتح الإحالات" };
    case "SYNC_MASTER_DATA":
      return { to: "/master-data", label: "فتح البيانات المرجعية" };
    case "REQUEST_PATIENT_DATA":
      return { to: "/patients", label: "فتح المرضى" };
    case "REQUEST_NEW_VISITS":
      return {
        to: buildPath(centerCode ? "/centers" : "/reports", {
          centerCode,
          focus: "visits"
        }),
        label: centerCode ? "فتح المركز" : "فتح تقرير الزيارات"
      };
    case "REQUEST_LAB_RESULTS":
    case "PING":
    case "ALERT":
    default:
      return {
        to: centerCode ? buildPath("/centers", { centerCode, focus: "visits" }) : "/centers",
        label: centerCode ? "فتح المركز" : "فتح المراكز"
      };
  }
}

export function NotificationsPage() {
  const { user } = useAuth();
  const [centralBundle, setCentralBundle] = useState<CentralNotificationsBundle | null>(null);
  const [centerBundle, setCenterBundle] = useState<CenterNotificationsBundle | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") ?? "all";
  const statusFilter = searchParams.get("status") ?? "";
  const typeFilter = searchParams.get("type") ?? "";
  const centerCodeFilter = searchParams.get("centerCode") ?? "";

  async function loadData() {
    if (!user) {
      return;
    }

    if (user.workspace === "central") {
      setCentralBundle(await apiRequest<CentralNotificationsBundle>("/central/notifications"));
      setCenterBundle(null);
      return;
    }

    setCenterBundle(await apiRequest<CenterNotificationsBundle>("/center/notifications"));
    setCentralBundle(null);
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, [user]);

  async function processQueues() {
    setProcessing(true);

    try {
      await apiRequest(user?.workspace === "central" ? "/central/process" : "/center/notifications/process", {
        method: "POST"
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر معالجة الطوابير.");
    } finally {
      setProcessing(false);
    }
  }

  async function retryOutgoing(notificationId: number) {
    try {
      await apiRequest(`/center/notifications/retry/${notificationId}`, {
        method: "POST"
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إعادة المحاولة.");
    }
  }

  if (user?.workspace === "central" && centralBundle) {
    const outgoingItems = centralBundle.outgoing.filter((item) => {
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      if (typeFilter && item.notificationType !== typeFilter) {
        return false;
      }

      if (centerCodeFilter && item.targetCenter.centerCode !== centerCodeFilter) {
        return false;
      }

      return true;
    });

    const incomingItems = centralBundle.incoming.filter((item) => {
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      if (typeFilter && item.notificationType !== typeFilter) {
        return false;
      }

      if (centerCodeFilter && item.fromCenter.centerCode !== centerCodeFilter) {
        return false;
      }

      return true;
    });

    const communicationLogs = centralBundle.communicationLogs.filter((log) => {
      if (statusFilter && log.status !== statusFilter) {
        return false;
      }

      if (typeFilter && log.notificationType !== typeFilter) {
        return false;
      }

      if (centerCodeFilter && log.center?.centerCode !== centerCodeFilter) {
        return false;
      }

      return true;
    });

    const hasFilters = Boolean(statusFilter || typeFilter || centerCodeFilter || (view && view !== "all"));
    const showOutgoing = view === "all" || view === "outgoing";
    const showIncoming = view === "all" || view === "incoming";
    const showLogs = view === "all" || view === "logs";
    const hasVisibleData =
      outgoingItems.length > 0 || incomingItems.length > 0 || communicationLogs.length > 0;

    return (
      <div className="page-stack">
        <SectionCard
          title="مركز الإشعارات المركزي"
          subtitle="كل عنصر أصبح قابلًا للانتقال إلى الصفحة المرتبطة به أو إلى سجل مشابه له."
          action={
            <div className="button-row">
              {hasFilters ? (
                <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
                  مسح الفلاتر
                </button>
              ) : null}
              <button className="primary-button" type="button" onClick={() => void processQueues()}>
                {processing ? "جارٍ المعالجة..." : "معالجة الطوابير"}
              </button>
            </div>
          }
        >
          {error ? <div className="error-banner">{error}</div> : null}

          {hasFilters ? (
            <div className="filter-summary">
              <div>
                <strong>عرض مفلتر</strong>
                <p className="muted">
                  {statusFilter ? `الحالة: ${toArabicLabel(statusFilter)}. ` : ""}
                  {typeFilter ? `النوع: ${toArabicLabel(typeFilter)}. ` : ""}
                  {centerCodeFilter ? `المركز: ${centerCodeFilter}. ` : ""}
                  {view !== "all" ? `القسم: ${view}.` : ""}
                </p>
              </div>
            </div>
          ) : null}

          <div className="button-row">
            <Link className={`ghost-button${view === "all" ? " active-filter" : ""}`} to="/notifications">
              الكل
            </Link>
            <Link
              className={`ghost-button${view === "outgoing" ? " active-filter" : ""}`}
              to={buildPath("/notifications", {
                view: "outgoing",
                status: statusFilter || undefined,
                type: typeFilter || undefined,
                centerCode: centerCodeFilter || undefined
              })}
            >
              الصادر
            </Link>
            <Link
              className={`ghost-button${view === "incoming" ? " active-filter" : ""}`}
              to={buildPath("/notifications", {
                view: "incoming",
                status: statusFilter || undefined,
                type: typeFilter || undefined,
                centerCode: centerCodeFilter || undefined
              })}
            >
              الوارد
            </Link>
            <Link
              className={`ghost-button${view === "logs" ? " active-filter" : ""}`}
              to={buildPath("/notifications", {
                view: "logs",
                status: statusFilter || undefined,
                type: typeFilter || undefined,
                centerCode: centerCodeFilter || undefined
              })}
            >
              سجل الاتصال
            </Link>
          </div>

          {!hasVisibleData ? (
            <div className="empty-state compact">لا توجد إشعارات أو سجلات تطابق الفلاتر الحالية.</div>
          ) : null}

          {showOutgoing || showIncoming ? (
            <div className="split-grid">
              {showOutgoing ? (
                <div className="section-card inset-card">
                  <h3>إشعارات صادرة إلى المراكز</h3>
                  <div className="stack-list">
                    {outgoingItems.length === 0 ? (
                      <div className="empty-state compact">لا توجد عناصر صادرة مطابقة.</div>
                    ) : (
                      outgoingItems.map((item) => {
                        const primaryTarget = buildNotificationTarget(
                          item.notificationType,
                          item.targetCenter.centerCode
                        );

                        return (
                          <article className="stack-item" key={item.id}>
                            <div className="info-row">
                              <div>
                                <strong>{toArabicLabel(item.notificationType)}</strong>
                                <p className="muted">
                                  {item.targetCenter.centerName} • {item.targetCenter.centerCode}
                                </p>
                              </div>
                              <StatusBadge status={item.status} />
                            </div>
                            <span className="muted">{formatDateTime(item.createdAt)}</span>
                            <div className="button-row">
                              <Link className="ghost-button" to={primaryTarget.to}>
                                {primaryTarget.label}
                              </Link>
                              <Link
                                className="ghost-button"
                                to={buildPath("/centers", {
                                  centerCode: item.targetCenter.centerCode,
                                  focus: "visits"
                                })}
                              >
                                فتح المركز
                              </Link>
                              <Link
                                className="ghost-button"
                                to={buildPath("/notifications", {
                                  view: "outgoing",
                                  status: item.status,
                                  type: item.notificationType,
                                  centerCode: item.targetCenter.centerCode
                                })}
                              >
                                عرض المشابه
                              </Link>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

              {showIncoming ? (
                <div className="section-card inset-card">
                  <h3>إشعارات واردة من المراكز</h3>
                  <div className="stack-list">
                    {incomingItems.length === 0 ? (
                      <div className="empty-state compact">لا توجد عناصر واردة مطابقة.</div>
                    ) : (
                      incomingItems.map((item) => {
                        const primaryTarget = buildNotificationTarget(
                          item.notificationType,
                          item.fromCenter.centerCode
                        );

                        return (
                          <article className="stack-item" key={item.id}>
                            <div className="info-row">
                              <div>
                                <strong>{toArabicLabel(item.notificationType)}</strong>
                                <p className="muted">
                                  {item.fromCenter.centerName} • {item.fromCenter.centerCode}
                                </p>
                              </div>
                              <StatusBadge status={item.status} />
                            </div>
                            <span className="muted">{formatDateTime(item.receivedAt)}</span>
                            <div className="button-row">
                              <Link className="ghost-button" to={primaryTarget.to}>
                                {primaryTarget.label}
                              </Link>
                              <Link
                                className="ghost-button"
                                to={buildPath("/centers", {
                                  centerCode: item.fromCenter.centerCode,
                                  focus: "visits"
                                })}
                              >
                                فتح المركز
                              </Link>
                              <Link
                                className="ghost-button"
                                to={buildPath("/notifications", {
                                  view: "incoming",
                                  status: item.status,
                                  type: item.notificationType,
                                  centerCode: item.fromCenter.centerCode
                                })}
                              >
                                عرض المشابه
                              </Link>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        {showLogs ? (
          <SectionCard title="سجل التتبع الاتصالي" subtitle="أضفنا أزرار انتقال مباشرة من كل سجل إلى الصفحة المناسبة أو إلى المركز المرتبط.">
            {communicationLogs.length === 0 ? (
              <div className="empty-state compact">لا توجد سجلات اتصال مطابقة للفلاتر الحالية.</div>
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الاتجاه</th>
                      <th>النوع</th>
                      <th>المركز</th>
                      <th>الحالة</th>
                      <th>التوقيت</th>
                      <th>الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communicationLogs.map((log) => {
                      const primaryTarget = buildNotificationTarget(
                        log.notificationType,
                        log.center?.centerCode
                      );

                      return (
                        <tr key={log.id}>
                          <td>{toArabicLabel(log.direction)}</td>
                          <td>{toArabicLabel(log.notificationType)}</td>
                          <td>{log.center?.centerName ?? "النظام"}</td>
                          <td>
                            <StatusBadge status={log.status} />
                          </td>
                          <td>{formatDateTime(log.createdAt)}</td>
                          <td>
                            <div className="button-row table-actions">
                              <Link className="ghost-button" to={primaryTarget.to}>
                                {primaryTarget.label}
                              </Link>
                              {log.center ? (
                                <Link
                                  className="ghost-button"
                                  to={buildPath("/centers", {
                                    centerCode: log.center.centerCode,
                                    focus: "visits"
                                  })}
                                >
                                  فتح المركز
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        ) : null}
      </div>
    );
  }

  if (!centerBundle) {
    return <div className="empty-state">جارٍ تحميل الإشعارات...</div>;
  }

  return (
    <div className="page-stack">
      <SectionCard
        title="مراقبة الإشعارات المحلية"
        subtitle="متابعة الإشعارات الواردة من النظام المركزي، والمحاولات الصادرة، والتنبيهات التشغيلية."
        action={
          user?.role === "CENTER_MANAGER" ? (
            <button className="primary-button" type="button" onClick={() => void processQueues()}>
              {processing ? "جارٍ المعالجة..." : "معالجة الآن"}
            </button>
          ) : null
        }
      >
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="split-grid">
          <div className="section-card inset-card">
            <h3>وارد من النظام المركزي</h3>
            <div className="stack-list">
              {centerBundle.incoming.map((item) => (
                <article key={item.id} className="stack-item">
                  <div className="info-row">
                    <div>
                      <strong>{toArabicLabel(item.notificationType)}</strong>
                      <p className="muted">{formatDateTime(item.receivedAt)}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="section-card inset-card">
            <h3>صادر إلى النظام المركزي</h3>
            <div className="stack-list">
              {centerBundle.outgoing.map((item) => (
                <article key={item.id} className="stack-item">
                  <div className="info-row">
                    <div>
                      <strong>{toArabicLabel(item.notificationType)}</strong>
                      <p className="muted">
                        المحاولات {item.retryCount}/{item.maxRetries}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  {user?.role === "CENTER_MANAGER" && item.status !== "COMPLETED" ? (
                    <button className="ghost-button" type="button" onClick={() => void retryOutgoing(item.id)}>
                      إعادة المحاولة الآن
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard title="تنبيهات النظام" subtitle="تنبيهات وتحذيرات يراجعها مدير المركز.">
          <div className="stack-list">
            {centerBundle.alerts.map((alert) => (
              <article key={alert.id} className="stack-item">
                <div className="info-row">
                  <div>
                    <strong>{alert.title}</strong>
                    <p className="muted">{alert.message}</p>
                  </div>
                  <StatusBadge status={alert.severity} />
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="سجل المعالجة" subtitle="آخر الإجراءات التي نُفذت على طوابير الإشعارات داخل المركز.">
          <div className="stack-list">
            {centerBundle.logs.map((log) => (
              <article key={log.id} className="stack-item">
                <div className="info-row">
                  <div>
                    <strong>{log.message}</strong>
                    <p className="muted">{formatDateTime(log.createdAt)}</p>
                  </div>
                  <StatusBadge status={log.severity} />
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
