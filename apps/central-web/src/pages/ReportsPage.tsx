import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { formatCount, toArabicLabel } from "../lib/arabic";
import { ReportSummary } from "../types";

type RangePreset = "last7" | "last30" | "month" | "custom";

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

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function calculateRange(rangePreset: RangePreset, startDate: string, endDate: string) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  if (rangePreset === "last7") {
    start.setDate(now.getDate() - 6);
  } else if (rangePreset === "last30") {
    start.setDate(now.getDate() - 29);
  } else if (rangePreset === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    return { startDate, endDate };
  }

  return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary | null>(null);
  const [error, setError] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("last30");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const focus = searchParams.get("focus") ?? "";
  const selectedCenterId = Number(searchParams.get("centerId") ?? "");
  const activeRange = calculateRange(rangePreset, customStartDate, customEndDate);

  useEffect(() => {
    const path = buildPath("/central/reports", {
      startDate: activeRange.startDate,
      endDate: activeRange.endDate
    });

    apiRequest<ReportSummary>(path)
      .then((payload) => {
        setReports(payload);
        setError("");
      })
      .catch((cause: Error) => setError(cause.message));
  }, [activeRange.endDate, activeRange.startDate]);

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
    return <div className="empty-state">جاري تحميل التقارير...</div>;
  }

  const totalVisits = visibleVisits.reduce((sum, item) => sum + item.visitCount, 0);
  const totalReferrals = reports.referralsByStatus.reduce((sum, item) => sum + item.count, 0);
  const totalNotifications = reports.notificationHealth.reduce((sum, item) => sum + item.count, 0);
  const hasFilters = Boolean(focus || selectedCenterId);
  const filterLabel = selectedCenterVisit?.centerName ?? selectedCenterLoad?.centerName ?? null;

  function exportExcel() {
    if (!reports) {
      return;
    }

    downloadCsv("central-report.csv", [
      ["القسم", "العنصر", "القيمة"],
      ["الملخص", "إجمالي الزيارات", String(totalVisits)],
      ["الملخص", "إجمالي الإحالات", String(totalReferrals)],
      ["الملخص", "إجمالي الإشعارات", String(totalNotifications)],
      ...reports.referralsByStatus.map((item) => ["الإحالات حسب الحالة", toArabicLabel(item.status), String(item.count)]),
      ...visibleVisits.map((item) => ["الزيارات حسب المركز", item.centerName, String(item.visitCount)]),
      ...visibleCenterLoad.map((item) => ["الحمل الحالي", item.centerName, `${item.currentPatientLoad} / ${item.averageWaitTime} دقيقة`])
    ]);
  }

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">تقارير تنفيذية</p>
          <h1>ملخصات قابلة للتصدير</h1>
        </div>
        <p className="muted">
          هذه الصفحة مخصصة للتقارير القصيرة والتصدير. تبقى صفحة التحليلات مخصصة للرسوم والتحليل التفصيلي.
        </p>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <SectionCard
        title="فترة التقرير"
        subtitle="تستخدم التقارير والملفات المصدرة الفترة والفلاتر الحالية."
        action={
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => window.print()}>
              PDF
            </button>
            <button className="ghost-button" type="button" onClick={exportExcel}>
              Excel
            </button>
          </div>
        }
      >
        <div className="filter-grid">
          <label className="field">
            <span>الفترة</span>
            <select value={rangePreset} onChange={(event) => setRangePreset(event.target.value as RangePreset)}>
              <option value="last7">آخر 7 أيام</option>
              <option value="last30">آخر 30 يوم</option>
              <option value="month">هذا الشهر</option>
              <option value="custom">فترة مخصصة</option>
            </select>
          </label>
          {rangePreset === "custom" ? (
            <>
              <label className="field">
                <span>من</span>
                <input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} />
              </label>
              <label className="field">
                <span>إلى</span>
                <input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
      </SectionCard>

      {hasFilters ? (
        <div className="filter-summary">
          <div>
            <strong>عرض موجّه من التقارير</strong>
            <p className="muted">
              {filterLabel
                ? `تم تركيز العرض على ${filterLabel}${focus === "visits" ? " ضمن نشاط الزيارات." : focus === "load" ? " ضمن مؤشرات الحمل." : "."}`
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
          value={formatCount(totalVisits)}
          helper="إجمالي الزيارات المتزامنة الواردة من المراكز المتصلة ضمن الفترة."
          to={buildPath("/reports", { focus: "visits" })}
          actionHint="فتح تقرير الزيارات"
        />
        <MetricCard
          label="إجمالي الإحالات"
          value={formatCount(totalReferrals)}
          helper="جميع حالات الإحالات المرصودة على مستوى الشبكة ضمن الفترة."
          to="/referrals"
          actionHint="فتح سجل الإحالات"
        />
        <MetricCard
          label="الإشعارات المتابعة"
          value={formatCount(totalNotifications)}
          helper="ملخص صحة طوابير الإشعارات للتقارير التشغيلية."
          to="/notifications"
          actionHint="فتح مركز الإشعارات"
        />
      </div>

      <div className="split-grid">
        <SectionCard title="الإحالات حسب الحالة" subtitle="ملخص تنفيذي صغير مع رابط مباشر للتفاصيل.">
          <div className="stack-list compact">
            {reports.referralsByStatus.map((item) => (
              <article key={item.status} className="stack-item">
                <div className="info-row">
                  <span>{toArabicLabel(item.status)}</span>
                  <strong>{formatCount(item.count)}</strong>
                </div>
                <Link className="ghost-button" to={buildPath("/referrals", { status: item.status })}>
                  فتح الإحالات
                </Link>
              </article>
            ))}
            {reports.referralsByStatus.length === 0 ? <div className="empty-state compact">لا يوجد</div> : null}
          </div>
        </SectionCard>

        <SectionCard title="صحة الإشعارات" subtitle="ملخص مضغوط لحالات الإرسال والمعالجة.">
          <div className="stack-list compact">
            {reports.notificationHealth.map((item) => (
              <article key={item.status} className="stack-item">
                <div className="info-row">
                  <span>{toArabicLabel(item.status)}</span>
                  <strong>{formatCount(item.count)}</strong>
                </div>
                <Link className="ghost-button" to={buildPath("/notifications", { status: item.status })}>
                  فتح الإشعارات
                </Link>
              </article>
            ))}
            {reports.notificationHealth.length === 0 ? <div className="empty-state compact">لا يوجد</div> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="الزيارات حسب المركز" subtitle="كل صف يفتح التقرير أو صفحة المركز المرتبطة.">
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
                      <span>مركز متصل بالشبكة المركزية</span>
                    </td>
                    <td>{formatCount(item.visitCount)}</td>
                    <td>
                      <div className="button-row table-actions">
                        <Link className="ghost-button" to={buildPath("/reports", { focus: "visits", centerId: item.centerId })}>
                          تحليل الزيارات
                        </Link>
                        <Link className="ghost-button" to={buildPath("/centers", { centerId: item.centerId, focus: "visits" })}>
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
                  <span>الحمل النشط {formatCount(center.currentPatientLoad)}</span>
                  <span>متوسط انتظار {formatCount(center.averageWaitTime)} دقيقة</span>
                </div>
                <div className="button-row">
                  <Link className="ghost-button" to={buildPath("/centers", { centerId: center.centerId, focus: "load" })}>
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
