import { useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { CenterNotificationsBundle, CentralNotificationsBundle } from "../types";

export function NotificationsPage() {
  const { user } = useAuth();
  const [centralBundle, setCentralBundle] = useState<CentralNotificationsBundle | null>(null);
  const [centerBundle, setCenterBundle] = useState<CenterNotificationsBundle | null>(null);
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
    return (
      <div className="page-stack">
        <SectionCard
          title="مركز الإشعارات المركزي"
          subtitle="قناة الاتصال ثنائية الاتجاه بين النظام المركزي والمراكز الصحية المرتبطة."
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
                {centralBundle.outgoing.map((item) => (
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
                  </article>
                ))}
              </div>
            </div>

            <div className="section-card inset-card">
              <h3>إشعارات واردة من المراكز</h3>
              <div className="stack-list">
                {centralBundle.incoming.map((item) => (
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
                  </article>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="سجل التتبع الاتصالي" subtitle="أثر تشغيلي لتسليم الرسائل والاستجابات بين الأنظمة.">
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
                  <tr key={log.id}>
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
