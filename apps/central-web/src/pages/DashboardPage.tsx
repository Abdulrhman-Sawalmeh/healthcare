import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { isRouteEnabled } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { cleanDemoText, formatCount, formatDateTime, joinMeta, safeDisplay, toArabicLabel } from "../lib/arabic";
import { CentralDashboardData } from "../types";

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

function receivingCenterLabel(status: string, toCenter?: string | null) {
  if (status === "NO_CANDIDATE_REJECTED") {
    return "لا يوجد مركز مناسب";
  }

  return safeDisplay(toCenter, "لم يتم اختيار مركز مستقبل");
}

export function DashboardPage() {
  const { user } = useAuth();
  const [centralData, setCentralData] = useState<CentralDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    apiRequest<CentralDashboardData>("/central/dashboard")
      .then((payload) => {
        setCentralData(payload);
        setError("");
      })
      .catch((cause: Error) => {
        setError(cause.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user]);

  const centersRoute = isRouteEnabled("/centers") ? "/centers" : undefined;
  const patientsRoute = isRouteEnabled("/patients") ? "/patients" : undefined;
  const referralsRoute = isRouteEnabled("/referrals") ? "/referrals" : undefined;
  const notificationsRoute = isRouteEnabled("/notifications") ? "/notifications" : undefined;
  const reportsRoute = isRouteEnabled("/reports") ? "/reports" : undefined;

  function renderSectionAction(to: string | undefined, label: string) {
    return to ? (
      <Link className="ghost-button" to={to}>
        {label}
      </Link>
    ) : null;
  }

  if (loading) {
    return <div className="empty-state">جاري تحميل لوحة المتابعة...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  if (!centralData) {
    return <div className="empty-state">لا توجد بيانات متاحة لهذه الواجهة.</div>;
  }

  const pendingReferralsRoute = referralsRoute
    ? buildPath(referralsRoute, { status: "PENDING_RECEIVING_MANAGER" })
    : undefined;

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">Healthcare Ecosystem</p>
          <h1>لوحة المتابعة المركزية</h1>
        </div>
        <p className="muted">
          مؤشرات تشغيلية مختصرة قابلة للنقر لفتح السجلات المرتبطة بالمراكز والمرضى والإحالات والإشعارات.
        </p>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="المراكز المتصلة"
          value={formatCount(centralData.stats.connectedCenters)}
          helper="عدد المراكز المسموح لها حاليا بالتكامل مع النظام المركزي."
          to={centersRoute}
          actionHint="عرض التفاصيل"
        />
        <MetricCard
          label="المراكز الموقوفة"
          value={formatCount(centralData.stats.suspendedCenters)}
          helper="مراكز تم تعليق اتصالها مؤقتا من قبل الإدارة المركزية."
          to={centersRoute}
          actionHint="فتح السجلات المرتبطة"
        />
        <MetricCard
          label="المرضى المركزيون"
          value={formatCount(centralData.stats.unifiedPatients)}
          helper="عدد السجلات الصحية الموحدة المتاحة عبر جميع المراكز."
          to={patientsRoute}
          actionHint="فتح سجل المرضى"
        />
        <MetricCard
          label="الإحالات المعلقة"
          value={formatCount(centralData.stats.pendingReferrals)}
          helper="طلبات إحالة ما زالت بانتظار التوجيه أو قرار مدير المركز أو الاستكمال."
          to={pendingReferralsRoute ?? referralsRoute}
          actionHint="عرض الإحالات المعلقة"
        />
        <MetricCard
          label="إشعارات مركزية معلقة"
          value={formatCount(centralData.stats.pendingCentralNotifications)}
          helper="إشعارات ما زال على النظام المركزي معالجتها أو تسليمها."
          to={notificationsRoute}
          actionHint="فتح مركز الإشعارات"
        />
        <MetricCard
          label="طوابير المراكز الصادرة"
          value={formatCount(centralData.stats.pendingOutgoingNotifications)}
          helper="إشعارات محلية لم تصل بعد إلى النظام المركزي."
          to={notificationsRoute}
          actionHint="فتح السجلات المرتبطة"
        />
      </div>

      <div className="split-grid">
        <SectionCard
          title="خريطة حمل المراكز"
          subtitle="الوضع التشغيلي الحالي لكل مركز متصل."
          action={renderSectionAction(centersRoute, "فتح المراكز")}
        >
          <div className="stack-list">
            {centralData.centers.map((center) =>
              centersRoute ? (
                <Link
                  key={center.id}
                  className="stack-item interactive-card"
                  to={buildPath(centersRoute, { centerId: center.id, focus: "load" })}
                >
                  <div className="info-row">
                    <div>
                      <strong>{center.name}</strong>
                      <p className="muted">{joinMeta([center.code, center.city, toArabicLabel(center.type)])}</p>
                    </div>
                    <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                  </div>
                  <div className="tile-stats">
                    <span>{formatCount(center.patientCount)} مريض محلي</span>
                    <span>{formatCount(center.localVisitCount)} زيارة محلية</span>
                    <span>{formatCount(center.availableSpecialtySlots)} طبيب متاح</span>
                    <span>متوسط انتظار {formatCount(center.averageWaitTime)} دقيقة</span>
                  </div>
                  <p className="action-hint">عرض التفاصيل</p>
                </Link>
              ) : (
                <article key={center.id} className="stack-item">
                  <strong>{center.name}</strong>
                  <p>{joinMeta([center.code, center.city, toArabicLabel(center.type)])}</p>
                </article>
              )
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="مسار الإحالات"
          subtitle="توزيع حالات الإحالات الطبية بين المراكز."
          action={renderSectionAction(referralsRoute, "فتح الإحالات")}
        >
          <div className="stack-list compact">
            {centralData.referralPipeline.map((item) =>
              referralsRoute ? (
                <Link
                  key={item.status}
                  className="stack-item interactive-card"
                  to={buildPath(referralsRoute, { status: item.status })}
                >
                  <div className="info-row">
                    <span>{toArabicLabel(item.status)}</span>
                    <strong>{formatCount(item.count)}</strong>
                  </div>
                  <p className="action-hint">فتح الإحالات بهذا التصنيف</p>
                </Link>
              ) : (
                <div key={item.status} className="info-row">
                  <span>{toArabicLabel(item.status)}</span>
                  <strong>{formatCount(item.count)}</strong>
                </div>
              )
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="أحدث الإحالات"
        subtitle="آخر طلبات الإحالة ونتائج التوجيه العلاجي."
        action={renderSectionAction(referralsRoute, "فتح الإحالات")}
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>المريض</th>
                <th>المسار</th>
                <th>التخصص</th>
                <th>الحالة</th>
                <th>تاريخ الطلب</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {centralData.recentReferrals.map((referral) => (
                <tr key={referral.id}>
                  <td>
                    <strong>{safeDisplay(referral.patientName, "مريض غير متوفر")}</strong>
                    <span>{safeDisplay(referral.patientUnifiedId, "لا يوجد رقم موحد")}</span>
                  </td>
                  <td>
                    <strong>{safeDisplay(referral.fromCenter)}</strong>
                    <span>{receivingCenterLabel(referral.status, referral.toCenter)}</span>
                  </td>
                  <td>
                    <strong>{safeDisplay(referral.requiredSpecialty)}</strong>
                    <span>{toArabicLabel(referral.priority)}</span>
                  </td>
                  <td>
                    <StatusBadge status={referral.status} />
                  </td>
                  <td>{formatDateTime(referral.requestedAt)}</td>
                  <td>
                    {referralsRoute ? (
                      <Link className="ghost-button table-action-button" to={buildPath(referralsRoute, { referralId: referral.id })}>
                        عرض التفاصيل
                      </Link>
                    ) : (
                      "لا يوجد"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="أحدث الزيارات المتزامنة"
        subtitle="ملخصات الزيارات التي وصلت حديثا من المراكز المرتبطة."
        action={renderSectionAction(patientsRoute ?? reportsRoute, "فتح السجلات المرتبطة")}
      >
        <div className="card-grid">
          {centralData.recentVisits.map((visit) =>
            patientsRoute ? (
              <Link
                key={visit.id}
                className="profile-tile interactive-card"
                to={buildPath(patientsRoute, { search: visit.patientName })}
              >
                <p className="eyebrow">{safeDisplay(visit.centerName)}</p>
                <h3>{safeDisplay(visit.patientName)}</h3>
                <p>{cleanDemoText(visit.primaryDiagnosis)}</p>
                <div className="tile-stats">
                  <span>{toArabicLabel(visit.visitType)}</span>
                  <span>{formatDateTime(visit.visitDate)}</span>
                </div>
                <p className="action-hint">فتح السجلات المرتبطة</p>
              </Link>
            ) : (
              <article key={visit.id} className="profile-tile">
                <p className="eyebrow">{safeDisplay(visit.centerName)}</p>
                <h3>{safeDisplay(visit.patientName)}</h3>
                <p>{cleanDemoText(visit.primaryDiagnosis)}</p>
              </article>
            )
          )}
        </div>
      </SectionCard>
    </div>
  );
}
