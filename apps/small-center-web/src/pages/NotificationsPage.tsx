import { KeyboardEvent, MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { buildDoctorActionNotifications, DoctorVisitFileNotificationSource } from "../lib/doctor-notifications";
import { resolveNotificationPath } from "../lib/notification-routing";
import {
  filterReceptionAlerts,
  filterReceptionOutgoing,
  receptionNotificationViews,
  ReceptionNotificationView,
  resolveReceptionNotificationPath
} from "../lib/reception-notifications";
import { CenterNotificationsBundle, CentralNotificationsBundle, PortalThreadRecord } from "../types";

type CenterNotificationView =
  | "action"
  | "recent"
  | "alerts"
  | "logs"
  | "referrals"
  | "visits"
  | "patients"
  | "sync"
  | "prescriptions"
  | "messages"
  | "completed"
  | "pending"
  | "failed";

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

export function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [centralBundle, setCentralBundle] = useState<CentralNotificationsBundle | null>(null);
  const [centerBundle, setCenterBundle] = useState<CenterNotificationsBundle | null>(null);
  const [doctorThreads, setDoctorThreads] = useState<PortalThreadRecord[]>([]);
  const [doctorVisitFiles, setDoctorVisitFiles] = useState<DoctorVisitFileNotificationSource[]>([]);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [centerView, setCenterView] = useState<CenterNotificationView>("action");

  async function loadData() {
    if (!user) {
      return;
    }

    if (user.workspace === "central") {
      setCentralBundle(await apiRequest<CentralNotificationsBundle>("/central/notifications"));
      setCenterBundle(null);
      setDoctorThreads([]);
      setDoctorVisitFiles([]);
      return;
    }

    if (user.role === "DOCTOR") {
      const [notificationsResult, threadsResult, visitFilesResult] = await Promise.allSettled([
        apiRequest<CenterNotificationsBundle>("/center/notifications"),
        apiRequest<PortalThreadRecord[]>("/portal/communications/threads"),
        apiRequest<DoctorVisitFileNotificationSource[]>("/center/visit-workflow?status=WAITING_DOCTOR")
      ]);

      if (notificationsResult.status === "rejected") {
        throw notificationsResult.reason;
      }

      setCenterBundle(notificationsResult.value);
      setDoctorThreads(threadsResult.status === "fulfilled" ? threadsResult.value : []);
      setDoctorVisitFiles(visitFilesResult.status === "fulfilled" ? visitFilesResult.value : []);
      setCentralBundle(null);
      return;
    }

    setCenterBundle(await apiRequest<CenterNotificationsBundle>("/center/notifications"));
    setDoctorThreads([]);
    setDoctorVisitFiles([]);
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

  async function openCenterAlert(notificationId: number, path: string) {
    try {
      await apiRequest(`/center/notifications/${notificationId}/read`, {
        method: "PATCH"
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة الإشعار.");
    }

    handleCardNavigation(path);
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

  if (user?.role === "RECEPTIONIST") {
    const receptionView: ReceptionNotificationView =
      centerView === "visits" || centerView === "patients" || centerView === "sync" || centerView === "recent"
        ? centerView
        : "action";
    const visibleReceptionAlerts = filterReceptionAlerts(centerBundle.alerts, receptionView);
    const visibleReceptionOutgoing = filterReceptionOutgoing(centerBundle.outgoing, receptionView);

    return (
      <div className="page-stack">
        <SectionCard
          title="إشعارات موظف الاستقبال"
          subtitle="تنبيهات مرتبطة بتسجيل المرضى، طابور الزيارات، وتسليم رسائل الحسابات والمزامنة."
        >
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="chip-row">
            {receptionNotificationViews.map((view) => (
              <button
                key={view.value}
                className={receptionView === view.value ? "primary-button" : "ghost-button"}
                onClick={() => setCenterView(view.value)}
                type="button"
              >
                {view.label}
              </button>
            ))}
          </div>

          <div className="split-grid">
            <div className="section-card inset-card">
              <h3>تنبيهات الاستقبال</h3>
              <div className="stack-list">
                {visibleReceptionAlerts.map((alert) => {
                  const path = resolveReceptionNotificationPath({
                    role: user.role,
                    workspace: user.workspace,
                    type: alert.alertType ?? alert.severity,
                    title: alert.title,
                    body: alert.message,
                    targetUrl: alert.targetUrl
                  });

                  return (
                    <article
                      key={alert.id}
                      role="button"
                      tabIndex={0}
                      className="stack-item interactive-card"
                      onClick={() => void openCenterAlert(alert.id, path)}
                      onKeyDown={(event) => {
                        if (isActivationKey(event)) {
                          event.preventDefault();
                          void openCenterAlert(alert.id, path);
                        }
                      }}
                    >
                      <div className="info-row">
                        <div>
                          <strong>{alert.title}</strong>
                          <p className="muted">{alert.message}</p>
                        </div>
                        <StatusBadge status={alert.isResolved ? "COMPLETED" : alert.severity} />
                      </div>
                      <span className="muted">{formatDateTime(alert.createdAt)}</span>
                    </article>
                  );
                })}
                {visibleReceptionAlerts.length === 0 ? (
                  <div className="empty-state compact">لا توجد تنبيهات استقبال ضمن هذا التصنيف.</div>
                ) : null}
              </div>
            </div>

            <div className="section-card inset-card">
              <h3>رسائل وتسليم</h3>
              <div className="stack-list">
                {visibleReceptionOutgoing.map((item) => {
                  const path = resolveReceptionNotificationPath({
                    role: user.role,
                    workspace: user.workspace,
                    type: item.notificationType,
                    title: toArabicLabel(item.notificationType),
                    body: item.lastError ?? `المحاولات ${item.retryCount}/${item.maxRetries}`
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
                      {item.lastError ? <p className="muted">{item.lastError}</p> : null}
                      <span className="muted">{formatDateTime(item.createdAt)}</span>
                    </article>
                  );
                })}
                {visibleReceptionOutgoing.length === 0 ? (
                  <div className="empty-state compact">لا توجد رسائل أو عمليات مزامنة ضمن هذا التصنيف.</div>
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  const actionIncoming = centerBundle.incoming.filter((item) => item.status !== "COMPLETED");
  const actionOutgoing = centerBundle.outgoing.filter((item) => item.status !== "COMPLETED");
  const isDoctor = user?.role === "DOCTOR";
  const doctorActionItems = isDoctor
    ? buildDoctorActionNotifications({
        centerBundle,
        threads: doctorThreads,
        visitFiles: doctorVisitFiles,
        role: user?.role,
        workspace: user?.workspace
      })
    : [];
  const showDoctorActionList = isDoctor && centerView === "action";
  const showDoctorMessageList = isDoctor && centerView === "messages";
  const doctorMessageItems = doctorActionItems.filter((item) => item.id === "doctor-messages");
  const doctorVisitFileItems = doctorActionItems.filter((item) => item.id.startsWith("visit-file-"));
  const showDoctorVisitFileList = isDoctor && centerView === "visits";
  const isPendingStatus = (status: string) => ["PENDING", "PROCESSING", "SENT", "ACKNOWLEDGED"].includes(status);
  const isFailedStatus = (status: string) => ["FAILED", "PERMANENT_FAILURE"].includes(status);
  const matchesDoctorView = (type: string, status: string, title = "", message = "") => {
    const searchable = `${type} ${title} ${message}`.toUpperCase();

    if (centerView === "action") return status !== "COMPLETED";
    if (centerView === "referrals") return searchable.includes("REFERRAL") || searchable.includes("إحالة");
    if (centerView === "visits") return searchable.includes("VISIT") || searchable.includes("زيارة");
    if (centerView === "prescriptions") return searchable.includes("PRESCRIPTION") || searchable.includes("وصفة");
    if (centerView === "messages") return searchable.includes("MESSAGE") || searchable.includes("رسالة");
    if (centerView === "completed") return status === "COMPLETED";
    if (centerView === "pending") return isPendingStatus(status);
    if (centerView === "failed") return isFailedStatus(status);
    return true;
  };
  const visibleIncoming = isDoctor
    ? centerBundle.incoming.filter((item) => matchesDoctorView(item.notificationType, item.status))
    : centerView === "action"
      ? actionIncoming
      : centerBundle.incoming;
  const visibleOutgoing = isDoctor
    ? centerBundle.outgoing.filter((item) => matchesDoctorView(item.notificationType, item.status))
    : centerView === "action"
      ? actionOutgoing
      : centerBundle.outgoing;
  const visibleAlerts = isDoctor
    ? centerBundle.alerts.filter((alert) => matchesDoctorView(alert.severity, alert.isResolved ? "COMPLETED" : "PENDING", alert.title, alert.message))
    : centerBundle.alerts;
  const showQueues = isDoctor
    ? !showDoctorActionList &&
      !showDoctorMessageList &&
      !showDoctorVisitFileList &&
      centerView !== "alerts" &&
      centerView !== "logs"
    : centerView === "action" || centerView === "recent";
  const showAlerts = isDoctor
    ? !showDoctorActionList && !showDoctorMessageList && !showDoctorVisitFileList && centerView !== "logs"
    : centerView === "alerts" || centerView === "recent";
  const showLogs = centerView === "logs";

  return (
    <div className="page-stack">
      <SectionCard
        title={isDoctor ? "إشعارات الطبيب" : "مراقبة الإشعارات المحلية"}
        subtitle={
          isDoctor
            ? "تنبيهات سريرية وإحالات ورسائل تحتاج متابعة من الطبيب."
            : "متابعة الإشعارات الواردة من النظام المركزي، والمحاولات الصادرة، والتنبيهات التشغيلية."
        }
        action={
          user?.role === "CENTER_MANAGER" ? (
            <button className="primary-button" type="button" onClick={() => void processQueues()}>
              {processing ? "جارٍ المعالجة..." : "معالجة الآن"}
            </button>
          ) : null
        }
      >
        {error ? <div className="error-banner">{error}</div> : null}

        {isDoctor ? (
          <div className="chip-row">
            <button className={centerView === "action" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("action")} type="button">تحتاج إجراء</button>
            <button className={centerView === "referrals" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("referrals")} type="button">الإحالات</button>
            <button className={centerView === "visits" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("visits")} type="button">الزيارات</button>
            <button className={centerView === "prescriptions" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("prescriptions")} type="button">الوصفات</button>
            <button className={centerView === "messages" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("messages")} type="button">الرسائل الطبية</button>
            <button className={centerView === "completed" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("completed")} type="button">مكتمل</button>
            <button className={centerView === "pending" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("pending")} type="button">قيد الانتظار</button>
            <button className={centerView === "failed" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("failed")} type="button">فشل</button>
            <button className={centerView === "logs" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("logs")} type="button">السجل التقني</button>
          </div>
        ) : (
          <div className="chip-row">
            <button className={centerView === "action" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("action")} type="button">
              يحتاج متابعة
            </button>
            <button className={centerView === "recent" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("recent")} type="button">
              الأحدث
            </button>
            <button className={centerView === "alerts" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("alerts")} type="button">
              تنبيهات النظام
            </button>
            <button className={centerView === "logs" ? "primary-button" : "ghost-button"} onClick={() => setCenterView("logs")} type="button">
              السجل التقني
            </button>
          </div>
        )}

        {showDoctorActionList ? (
          <div className="stack-list">
            {doctorActionItems.map((item) => (
              <article key={item.id} {...interactiveProps(item.to)}>
                <div className="info-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.helper}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <span className="muted">{formatDateTime(item.createdAt)}</span>
              </article>
            ))}
            {doctorActionItems.length === 0 ? (
              <div className="empty-state compact">لا توجد إشعارات تحتاج إجراء حاليًا.</div>
            ) : null}
          </div>
        ) : null}

        {showDoctorMessageList ? (
          <div className="stack-list">
            {doctorMessageItems.map((item) => (
              <article key={item.id} {...interactiveProps(item.to)}>
                <div className="info-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.helper}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <span className="muted">{formatDateTime(item.createdAt)}</span>
              </article>
            ))}
            {doctorMessageItems.length === 0 ? (
              <div className="empty-state compact">لا توجد رسائل طبية تحتاج ردًا حاليًا.</div>
            ) : null}
          </div>
        ) : null}

        {showDoctorVisitFileList ? (
          <div className="stack-list">
            {doctorVisitFileItems.map((item) => (
              <article key={item.id} {...interactiveProps(item.to)}>
                <div className="info-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.helper}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <span className="muted">{formatDateTime(item.createdAt)}</span>
              </article>
            ))}
            {doctorVisitFileItems.length === 0 ? (
              <div className="empty-state compact">لا توجد ملفات زيارة بانتظارك حاليًا.</div>
            ) : null}
          </div>
        ) : null}

        {showQueues ? (
        <div className="split-grid">
          <div className="section-card inset-card">
            <h3>وارد من النظام المركزي</h3>
            <div className="stack-list">
              {visibleIncoming.map((item) => {
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
              {visibleIncoming.length === 0 ? <div className="empty-state compact">لا توجد إشعارات واردة تحتاج متابعة.</div> : null}
            </div>
          </div>

          <div className="section-card inset-card">
            <h3>صادر إلى النظام المركزي</h3>
            <div className="stack-list">
              {visibleOutgoing.map((item) => {
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
              {visibleOutgoing.length === 0 ? <div className="empty-state compact">لا توجد إشعارات صادرة تحتاج متابعة.</div> : null}
            </div>
          </div>
        </div>
        ) : null}
      </SectionCard>

      <div className="split-grid">
        {showAlerts ? (
        <SectionCard title="تنبيهات النظام" subtitle="تنبيهات وتحذيرات يراجعها مدير المركز.">
          <div className="stack-list">
            {visibleAlerts.map((alert) => {
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
            {visibleAlerts.length === 0 ? <div className="empty-state compact">لا توجد تنبيهات ضمن هذا التصنيف.</div> : null}
          </div>
        </SectionCard>
        ) : null}

        {showLogs ? (
        <SectionCard title="السجل التقني" subtitle="سجل مختصر للمراجعة عند الحاجة فقط.">
          <div className="stack-list">
            {centerBundle.logs.map((log) => {
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
        ) : null}
      </div>
    </div>
  );
}
