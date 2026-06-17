import { CentralAnalyticsDashboardData } from "../../types";
import { formatDateTime } from "../../lib/arabic";
import { StatusBadge } from "../StatusBadge";
import { AnalyticsEmptyState } from "./AnalyticsStates";

interface SystemHealthWidgetProps {
  health: CentralAnalyticsDashboardData["systemHealth"];
}

export function SystemHealthWidget({ health }: SystemHealthWidgetProps) {
  return (
    <div className="system-health-grid">
      <div className="health-center-list">
        {health.centers.map((center) => (
          <article className="health-center-card" key={center.centerId}>
            <div className="info-row">
              <div>
                <strong>{center.name}</strong>
                <span className="muted">{center.code}</span>
              </div>
              <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
            </div>
            <dl>
              <div>
                <dt>مزامنة معلقة</dt>
                <dd>{center.pendingSyncCount}</dd>
              </div>
              <div>
                <dt>فشل مزامنة</dt>
                <dd>{center.failedSyncCount}</dd>
              </div>
              <div>
                <dt>حمل الطابور</dt>
                <dd>{center.queueLoad ?? "-"}</dd>
              </div>
              <div>
                <dt>آخر مزامنة</dt>
                <dd>{center.lastSyncAt ? formatDateTime(center.lastSyncAt) : "-"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="health-events">
        <section>
          <h3>أخطاء حديثة</h3>
          {health.recentErrors.length === 0 ? (
            <AnalyticsEmptyState message="لا توجد أخطاء مزامنة حديثة ضمن الفترة المحددة." />
          ) : (
            <div className="stack-list compact">
              {health.recentErrors.map((error) => (
                <article className="stack-item" key={error.id}>
                  <div className="info-row">
                    <strong>{error.centerName}</strong>
                    <StatusBadge status={error.severity} />
                  </div>
                  <p>{error.message}</p>
                  <span className="muted">{formatDateTime(error.createdAt)}</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>تنبيهات مهمة</h3>
          {health.recentAlerts.length === 0 ? (
            <AnalyticsEmptyState message="لا توجد تنبيهات نظام حديثة ضمن الفلاتر الحالية." />
          ) : (
            <div className="stack-list compact">
              {health.recentAlerts.map((alert) => (
                <article className="stack-item" key={alert.id}>
                  <div className="info-row">
                    <strong>{alert.title}</strong>
                    <StatusBadge status={alert.isResolved ? "completed" : alert.severity} />
                  </div>
                  <p>{alert.message}</p>
                  <span className="muted">
                    {alert.centerName} - {formatDateTime(alert.createdAt)}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
