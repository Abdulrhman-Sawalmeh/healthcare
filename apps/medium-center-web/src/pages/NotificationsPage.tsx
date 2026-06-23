import { KeyboardEvent, MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { resolveNotificationPath } from "../lib/notification-routing";
import { CenterNotificationsBundle, CentralNotificationsBundle } from "../types";

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

type CenterNotificationFilter = "ALL" | "APPOINTMENT" | "MESSAGE" | "REFERRAL" | "LAB" | "ERROR";

const centerNotificationFilters: Array<{ value: CenterNotificationFilter; label: string }> = [
  { value: "ALL", label: "الكل" },
  { value: "APPOINTMENT", label: "المواعيد" },
  { value: "MESSAGE", label: "الرسائل" },
  { value: "REFERRAL", label: "الإحالات" },
  { value: "LAB", label: "المختبر" },
  { value: "ERROR", label: "الأخطاء" }
];

function matchesCenterFilter(value: CenterNotificationFilter, source: string) {
  const haystack = source.toLowerCase();

  if (value === "ALL") return true;
  if (value === "ERROR") return ["error", "failed", "warning", "خطأ", "فشل", "تحذير"].some((term) => haystack.includes(term));
  if (value === "LAB") return ["lab", "result", "مختبر", "نتيجة"].some((term) => haystack.includes(term));

  return haystack.includes(value.toLowerCase());
}

export function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [centralBundle, setCentralBundle] = useState<CentralNotificationsBundle | null>(null);
  const [centerBundle, setCenterBundle] = useState<CenterNotificationsBundle | null>(null);
  const [centerFilter, setCenterFilter] = useState<CenterNotificationFilter>("ALL");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

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
    void loadData().catch((cause: Error) => setError(cause.message));
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

  async function retryOutgoing(event: MouseEvent<HTMLButtonElement>, notificationId: number) {
    event.stopPropagation();

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

  function handleCardNavigation(path: string) {
    if (path !== "/notifications") {
      navigate(path);
    }
  }

  function interactiveProps(path: string) {
    return {
      role: "button" as const,
      tabIndex: 0,
      className: "stack-item interactive-card",
      onClick: () => handleCardNavigation(path),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (isActivationKey(event)) {
          event.preventDefault();
          handleCardNavigation(path);
        }
      }
    };
  }

  if (user?.workspace === "central" && centralBundle) {
    return (
      <div className="page-stack">
        <SectionCard
          title="مركز الإشعارات المركزي"
          subtitle="قناة الاتصال الثنائية بين النظام المركزي والمراكز الصحية المرتبطة."
          action={
            <button className="primary-button" type="button" onClick={() => void processQueues()}>
              {processing ? "جارٍ المعالجة..." : "معالجة الطوابير"}
            </button>
          }
        >
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="split-grid">
            <div className="section-card inset-card">
              <h3>إشعارات صادرة إلى المراكز</h3>
              <div className="stack-list">
                {centralBundle.outgoing.map((item) => {
                  const path = resolveNotificationPath({
                    role: user.role,
                    workspace: user.workspace,
                    type: item.notificationType,
                    title: toArabicLabel(item.notificationType),
                    body: item.targetCenter.centerName
                  });

                  return (
                    <article key={item.id} {...interactiveProps(path)}>
                      <div className="info-row">
                        <div>
                          <strong>{toArabicLabel(item.notificationType)}</strong>
                          <p className="muted">
                            {item.targetCenter.centerName} - {item.targetCenter.centerCode}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <span className="muted">{formatDateTime(item.createdAt)}</span>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="section-card inset-card">
              <h3>إشعارات واردة من المراكز</h3>
              <div className="stack-list">
                {centralBundle.incoming.map((item) => {
                  const path = resolveNotificationPath({
                    role: user.role,
                    workspace: user.workspace,
                    type: item.notificationType,
                    title: toArabicLabel(item.notificationType),
                    body: item.fromCenter.centerName
                  });

                  return (
                    <article key={item.id} {...interactiveProps(path)}>
                      <div className="info-row">
                        <div>
                          <strong>{toArabicLabel(item.notificationType)}</strong>
                          <p className="muted">
                            {item.fromCenter.centerName} - {item.fromCenter.centerCode}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <span className="muted">{formatDateTime(item.receivedAt)}</span>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="سجل التتبع الاتصالي"
          subtitle="أثر تشغيلي لتسليم الرسائل والاستجابات بين الأنظمة."
        >
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاتجاه</th>
                  <th>النوع</th>
                  <th>المركز</th>
                  <th>الحالة</th>
                  <th>التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {centralBundle.communicationLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="interactive-card"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      handleCardNavigation(
                        resolveNotificationPath({
                          role: user.role,
                          workspace: user.workspace,
                          type: log.notificationType,
                          title: toArabicLabel(log.notificationType),
                          body: log.center?.centerName ?? log.errorMessage ?? undefined
                        })
                      )
                    }
                    onKeyDown={(event) => {
                      if (isActivationKey(event)) {
                        event.preventDefault();
                        handleCardNavigation(
                          resolveNotificationPath({
                            role: user.role,
                            workspace: user.workspace,
                            type: log.notificationType,
                            title: toArabicLabel(log.notificationType),
                            body: log.center?.centerName ?? log.errorMessage ?? undefined
                          })
                        );
                      }
                    }}
                  >
                    <td>{toArabicLabel(log.direction)}</td>
                    <td>{toArabicLabel(log.notificationType)}</td>
                    <td>{log.center?.centerName ?? "النظام"}</td>
                    <td>
                      <StatusBadge status={log.status} />
                    </td>
                    <td>{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!centerBundle) {
    return <div className="empty-state">جارٍ تحميل الإشعارات...</div>;
  }

  const filteredCenterIncoming = centerBundle.incoming.filter((item) =>
    matchesCenterFilter(centerFilter, `${item.notificationType} ${item.responseStatus ?? ""} ${item.responseError ?? ""}`)
  );
  const filteredCenterOutgoing = centerBundle.outgoing.filter((item) =>
    matchesCenterFilter(centerFilter, `${item.notificationType} ${item.status} ${item.lastError ?? ""}`)
  );
  const filteredCenterAlerts = centerBundle.alerts.filter((alert) =>
    matchesCenterFilter(centerFilter, `${alert.severity} ${alert.title} ${alert.message}`)
  );
  const filteredCenterLogs = centerBundle.logs.filter((log) =>
    matchesCenterFilter(centerFilter, `${log.severity} ${log.message}`)
  );

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
        <div className="chip-row">
          {centerNotificationFilters.map((filter) => (
            <button
              className={centerFilter === filter.value ? "primary-button" : "ghost-button"}
              key={filter.value}
              type="button"
              onClick={() => setCenterFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="split-grid">
          <div className="section-card inset-card">
            <h3>وارد من النظام المركزي</h3>
            <div className="stack-list">
              {filteredCenterIncoming.map((item) => {
                const path = resolveNotificationPath({
                  role: user?.role,
                  workspace: user?.workspace,
                  type: item.notificationType,
                  title: toArabicLabel(item.notificationType),
                  body: item.responseError ?? item.responseStatus ?? undefined
                });

                return (
                  <article key={item.id} {...interactiveProps(path)}>
                    <div className="info-row">
                      <div>
                        <strong>{toArabicLabel(item.notificationType)}</strong>
                        <p className="muted">{formatDateTime(item.receivedAt)}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="section-card inset-card">
            <h3>صادر إلى النظام المركزي</h3>
            <div className="stack-list">
              {filteredCenterOutgoing.map((item) => {
                const path = resolveNotificationPath({
                  role: user?.role,
                  workspace: user?.workspace,
                  type: item.notificationType,
                  title: toArabicLabel(item.notificationType),
                  body: item.lastError ?? `عدد المحاولات ${item.retryCount}/${item.maxRetries}`
                });

                return (
                  <article key={item.id} {...interactiveProps(path)}>
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
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={(event) => void retryOutgoing(event, item.id)}
                      >
                        إعادة المحاولة الآن
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard title="تنبيهات النظام" subtitle="تنبيهات وتحذيرات يراجعها مدير المركز.">
          <div className="stack-list">
            {filteredCenterAlerts.map((alert) => {
              const path = resolveNotificationPath({
                role: user?.role,
                workspace: user?.workspace,
                type: alert.severity,
                title: alert.title,
                body: alert.message,
                targetUrl: alert.targetUrl
              });

              return (
                <article key={alert.id} {...interactiveProps(path)}>
                  <div className="info-row">
                    <div>
                      <strong>{alert.title}</strong>
                      <p className="muted">{alert.message}</p>
                    </div>
                    <StatusBadge status={alert.severity} />
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="سجل المعالجة" subtitle="آخر الإجراءات التي نُفذت على طوابير الإشعارات داخل المركز.">
          <div className="stack-list">
            {filteredCenterLogs.map((log) => {
              const path = resolveNotificationPath({
                role: user?.role,
                workspace: user?.workspace,
                type: log.severity,
                title: log.message,
                body: undefined
              });

              return (
                <article key={log.id} {...interactiveProps(path)}>
                  <div className="info-row">
                    <div>
                      <strong>{log.message}</strong>
                      <p className="muted">{formatDateTime(log.createdAt)}</p>
                    </div>
                    <StatusBadge status={log.severity} />
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
