import { useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { toArabicLabel } from "../lib/arabic";
import { ReportSummary } from "../types";

export function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<ReportSummary>("/central/reports")
      .then((payload) => {
        setReports(payload);
        setError("");
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  if (!reports) {
    return <div className="empty-state">جارٍ تحميل التقارير...</div>;
  }

  const totalVisits = reports.visitsByCenter.reduce((sum, item) => sum + item.visitCount, 0);
  const totalReferrals = reports.referralsByStatus.reduce((sum, item) => sum + item.count, 0);
  const totalNotifications = reports.notificationHealth.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="metric-grid">
        <MetricCard
          label="إجمالي الزيارات"
          value={totalVisits}
          helper="إجمالي الزيارات المزامنة الواردة من المراكز المتصلة."
        />
        <MetricCard
          label="إجمالي الإحالات"
          value={totalReferrals}
          helper="جميع حالات الإحالات المرصودة على مستوى الشبكة."
        />
        <MetricCard
          label="الإشعارات المتابعة"
          value={totalNotifications}
          helper="ملخص صحة طوابير الإشعارات للتقارير التشغيلية."
        />
      </div>

      <div className="split-grid">
        <SectionCard title="الإحالات حسب الحالة" subtitle="توزيع الإحالات الطبية على مستوى الشبكة.">
          <div className="stack-list compact">
            {reports.referralsByStatus.map((item) => (
              <div key={item.status} className="info-row">
                <span>{toArabicLabel(item.status)}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="صحة الإشعارات" subtitle="الحالة التشغيلية لإشعارات النظام المركزي.">
          <div className="stack-list compact">
            {reports.notificationHealth.map((item) => (
              <div key={item.status} className="info-row">
                <span>{toArabicLabel(item.status)}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="الزيارات حسب المركز" subtitle="النشاط الذي أصبح مرئيًا للنظام المركزي بعد المزامنة.">
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>المركز</th>
                <th>عدد الزيارات</th>
              </tr>
            </thead>
            <tbody>
              {reports.visitsByCenter.map((item) => (
                <tr key={item.centerId}>
                  <td>{item.centerName}</td>
                  <td>{item.visitCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="مؤشرات الحمل الحالية" subtitle="الحمل الحالي ومتوسط الانتظار في كل مركز.">
        <div className="card-grid">
          {reports.centerLoad.map((center) => (
            <article key={center.centerId} className="profile-tile">
              <p className="eyebrow">مؤشر الحمل</p>
              <h3>{center.centerName}</h3>
              <div className="tile-stats">
                <span>الحمل النشط {center.currentPatientLoad}</span>
                <span>متوسط انتظار {center.averageWaitTime} دقيقة</span>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
