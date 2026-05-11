import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { toArabicLabel } from "../lib/arabic";
import { ReportSummary } from "../types";

function buildPath(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary | null>(null);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const focus = searchParams.get("focus") ?? "";
  const selectedCenterId = Number(searchParams.get("centerId") ?? "");

  useEffect(() => {
    apiRequest<ReportSummary>("/central/reports")
      .then((payload) => {
        setReports(payload);
        setError("");
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const selectedCenterVisit = useMemo(
    () => reports?.visitsByCenter.find((item) => item.centerId === selectedCenterId) ?? null,
    [reports, selectedCenterId]
  );
  const selectedCenterLoad = useMemo(
    () => reports?.centerLoad.find((item) => item.centerId === selectedCenterId) ?? null,
    [reports, selectedCenterId]
  );

  const visibleVisits = useMemo(() => {
    if (!reports) {
      return [];
    }

    if (!selectedCenterId) {
      return reports.visitsByCenter;
    }

    return reports.visitsByCenter.filter((item) => item.centerId === selectedCenterId);
  }, [reports, selectedCenterId]);

  const visibleCenterLoad = useMemo(() => {
    if (!reports) {
      return [];
    }

    if (!selectedCenterId) {
      return reports.centerLoad;
    }

    return reports.centerLoad.filter((item) => item.centerId === selectedCenterId);
  }, [reports, selectedCenterId]);

  if (!reports) {
    return <div className="empty-state">جارٍ تحميل التقارير...</div>;
  }

  const totalVisits = reports.visitsByCenter.reduce((sum, item) => sum + item.visitCount, 0);
  const totalReferrals = reports.referralsByStatus.reduce((sum, item) => sum + item.count, 0);
  const totalNotifications = reports.notificationHealth.reduce((sum, item) => sum + item.count, 0);
  const hasFilters = Boolean(focus || selectedCenterId);
  const filterLabel = selectedCenterVisit?.centerName ?? selectedCenterLoad?.centerName ?? null;

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}

      {hasFilters ? (
        <div className="filter-summary">
          <div>
            <strong>عرض موجّه من التقارير</strong>
            <p className="muted">
              {filterLabel
                ? `تم تركيز العرض على ${filterLabel}${focus === "visits" ? " ضمن نشاط الزيارات." : focus === "load" ? " ضمن مؤشرات الحمل." : "."}`
                : focus === "visits"
                  ? "يتم عرض جزء الزيارات التفصيلي داخل التقارير."
                  : "يتم عرض جزء محدد من التقارير."}
            </p>
          </div>
          <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
            مسح التحديد
          </button>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricCard
          label="إجمالي الزيارات"
          value={totalVisits}
          helper="إجمالي الزيارات المتزامنة الواردة من المراكز المتصلة."
          to={buildPath("/reports", { focus: "visits" })}
          actionHint="فتح تحليل الزيارات"
        />
        <MetricCard
          label="إجمالي الإحالات"
          value={totalReferrals}
          helper="جميع حالات الإحالات المرصودة على مستوى الشبكة."
          to="/referrals"
          actionHint="فتح سجل الإحالات"
        />
        <MetricCard
          label="الإشعارات المتابعة"
          value={totalNotifications}
          helper="ملخص صحة طوابير الإشعارات للتقارير التشغيلية."
          to="/notifications"
          actionHint="فتح مركز الإشعارات"
        />
      </div>

      <div className="split-grid">
        <SectionCard title="الإحالات حسب الحالة" subtitle="اختر الحالة لفتح سجل الإحالات مفلترًا بها.">
          <div className="stack-list compact">
            {reports.referralsByStatus.map((item) => (
              <article key={item.status} className="stack-item">
                <div className="info-row">
                  <span>{toArabicLabel(item.status)}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="button-row">
                  <Link className="ghost-button" to={buildPath("/referrals", { status: item.status })}>
                    فتح الإحالات
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="صحة الإشعارات" subtitle="اختر الحالة لفتح الإشعارات والسجل التشغيلي المطابق لها.">
          <div className="stack-list compact">
            {reports.notificationHealth.map((item) => (
              <article key={item.status} className="stack-item">
                <div className="info-row">
                  <span>{toArabicLabel(item.status)}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="button-row">
                  <Link className="ghost-button" to={buildPath("/notifications", { status: item.status })}>
                    فتح الإشعارات
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="الزيارات حسب المركز" subtitle="كل صف أصبح قابلًا للانتقال إلى تحليل الزيارات أو صفحة المركز المعني.">
        {visibleVisits.length === 0 ? (
          <div className="empty-state compact">لا توجد بيانات زيارات مطابقة للتحديد الحالي.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المركز</th>
                  <th>عدد الزيارات</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {visibleVisits.map((item) => (
                  <tr key={item.centerId}>
                    <td>
                      <strong>{item.centerName}</strong>
                      <span>مركز مرتبط في التقارير المركزية</span>
                    </td>
                    <td>{item.visitCount}</td>
                    <td>
                      <div className="button-row table-actions">
                        <Link
                          className="ghost-button"
                          to={buildPath("/reports", { focus: "visits", centerId: item.centerId })}
                        >
                          تحليل الزيارات
                        </Link>
                        <Link
                          className="ghost-button"
                          to={buildPath("/centers", { centerId: item.centerId, focus: "visits" })}
                        >
                          فتح المركز
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="مؤشرات الحمل الحالية" subtitle="بطاقات قابلة للنقر للانتقال إلى صفحة المركز المعني مباشرة.">
        {visibleCenterLoad.length === 0 ? (
          <div className="empty-state compact">لا توجد مؤشرات حمل مطابقة للتحديد الحالي.</div>
        ) : (
          <div className="card-grid">
            {visibleCenterLoad.map((center) => (
              <article key={center.centerId} className="profile-tile">
                <p className="eyebrow">مؤشر الحمل</p>
                <h3>{center.centerName}</h3>
                <div className="tile-stats">
                  <span>الحمل النشط {center.currentPatientLoad}</span>
                  <span>متوسط انتظار {center.averageWaitTime} دقيقة</span>
                </div>
                <div className="button-row">
                  <Link
                    className="ghost-button"
                    to={buildPath("/centers", { centerId: center.centerId, focus: "load" })}
                  >
                    فتح بيانات المركز
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
