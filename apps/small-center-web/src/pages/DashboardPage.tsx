import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { isRouteEnabled } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterWorkspaceData, CentralDashboardData, Role } from "../types";

export function DashboardPage() {
  const { user } = useAuth();
  const [centralData, setCentralData] = useState<CentralDashboardData | null>(null);
  const [centerData, setCenterData] = useState<CenterWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    const path = user.workspace === "central" ? "/central/dashboard" : "/center/dashboard";

    apiRequest<CentralDashboardData | CenterWorkspaceData>(path)
      .then((payload) => {
        if (user.workspace === "central") {
          setCentralData(payload as CentralDashboardData);
          setCenterData(null);
        } else {
          setCenterData(payload as CenterWorkspaceData);
          setCentralData(null);
        }
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
  const visitsRoute = isRouteEnabled("/visits") ? "/visits" : undefined;
  const referralsRoute = isRouteEnabled("/referrals") ? "/referrals" : undefined;
  const notificationsRoute = isRouteEnabled("/notifications") ? "/notifications" : undefined;
  const labRoute = isRouteEnabled("/lab") ? "/lab" : undefined;
  const pharmacyRoute = isRouteEnabled("/pharmacy") ? "/pharmacy" : undefined;
  const reportsRoute = isRouteEnabled("/reports") ? "/reports" : undefined;

  function renderSectionAction(to: string | undefined, label: string) {
    return to ? (
      <Link className="ghost-button" to={to}>
        {label}
      </Link>
    ) : null;
  }

  function resolveTeamRoute(role: Role) {
    switch (role) {
      case "CENTER_MANAGER":
        return referralsRoute ?? patientsRoute ?? visitsRoute ?? notificationsRoute;
      case "DOCTOR":
      case "NURSE":
        return visitsRoute ?? patientsRoute ?? referralsRoute ?? notificationsRoute;
      case "RECEPTIONIST":
        return patientsRoute ?? visitsRoute ?? notificationsRoute;
      case "LAB_TECH":
        return labRoute ?? notificationsRoute ?? visitsRoute;
      case "PHARMACIST":
        return pharmacyRoute ?? notificationsRoute ?? patientsRoute;
      default:
        return notificationsRoute ?? patientsRoute ?? visitsRoute;
    }
  }

  function formatCurrency(value: number) {
    return `${Math.round(value).toLocaleString()} شيكل`;
  }

  if (loading) {
    return <div className="empty-state">جارٍ تحميل لوحة المتابعة...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  if (user?.workspace === "central" && centralData) {
    const synchronizedVisitsRoute = patientsRoute ?? reportsRoute;

    return (
      <div className="page-stack">
        <div className="hero-strip">
          <div>
            <p className="eyebrow">النظام المركزي</p>
            <h1>لوحة متابعة مركزية موحدة للشبكة الصحية</h1>
          </div>
          <p className="muted">
            تتبع هذه اللوحة اتصال المراكز، ومسار الإحالات الطبية، وتغطية السجل الموحد للمرضى، وحالة طوابير الإشعارات
            بين الأنظمة من نقطة إشراف واحدة.
          </p>
        </div>

        <div className="metric-grid">
          <MetricCard
            label="المراكز المتصلة"
            value={centralData.stats.connectedCenters}
            helper="عدد المراكز المسموح لها حاليًا بالتكامل مع النظام المركزي."
            to={centersRoute}
            actionHint="اضغط لفتح صفحة المراكز."
          />
          <MetricCard
            label="المراكز الموقوفة"
            value={centralData.stats.suspendedCenters}
            helper="مراكز تم تعليق اتصالها مؤقتًا من قبل الإدارة المركزية."
            to={centersRoute}
            actionHint="اضغط لفتح صفحة المراكز."
          />
          <MetricCard
            label="المرضى الموحدون"
            value={centralData.stats.unifiedPatients}
            helper="عدد السجلات الصحية الموحدة المتاحة عبر جميع المراكز."
            to={patientsRoute}
            actionHint="اضغط لفتح صفحة المرضى."
          />
          <MetricCard
            label="الإحالات المعلقة"
            value={centralData.stats.pendingReferrals}
            helper="طلبات الإحالة التي ما زالت بانتظار التوجيه أو الاستكمال."
            to={referralsRoute}
            actionHint="اضغط لفتح صفحة الإحالات."
          />
          <MetricCard
            label="طابور مركزي معلق"
            value={centralData.stats.pendingCentralNotifications}
            helper="إشعارات ما زال على النظام المركزي معالجتها أو تسليمها."
            to={notificationsRoute}
            actionHint="اضغط لفتح صفحة الإشعارات."
          />
          <MetricCard
            label="طوابير المراكز الصادرة"
            value={centralData.stats.pendingOutgoingNotifications}
            helper="إشعارات محلية لم تصل بعد إلى النظام المركزي."
            to={notificationsRoute}
            actionHint="اضغط لفتح صفحة الإشعارات."
          />
        </div>

        <div className="split-grid">
          <SectionCard
            title="خريطة حمل المراكز"
            subtitle="الوضع التشغيلي الحالي لكل مركز متصل."
            action={renderSectionAction(centersRoute, "صفحة المراكز")}
          >
            <div className="stack-list">
              {centralData.centers.map((center) =>
                centersRoute ? (
                  <Link key={center.id} className="stack-item interactive-card" to={centersRoute}>
                    <div className="info-row">
                      <div>
                        <strong>{center.name}</strong>
                        <p className="muted">{joinMeta([center.code, center.city, toArabicLabel(center.type)])}</p>
                      </div>
                      <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                    </div>
                    <div className="tile-stats">
                      <span>{center.patientCount} مريضًا محليًا</span>
                      <span>{center.localVisitCount} زيارة محلية</span>
                      <span>{center.availableSpecialtySlots} طبيبًا متاحًا</span>
                      <span>متوسط انتظار {center.averageWaitTime} دقيقة</span>
                    </div>
                    <p className="action-hint">اضغط للانتقال إلى صفحة المراكز.</p>
                  </Link>
                ) : (
                  <article key={center.id} className="stack-item">
                    <div className="info-row">
                      <div>
                        <strong>{center.name}</strong>
                        <p className="muted">{joinMeta([center.code, center.city, toArabicLabel(center.type)])}</p>
                      </div>
                      <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                    </div>
                    <div className="tile-stats">
                      <span>{center.patientCount} مريضًا محليًا</span>
                      <span>{center.localVisitCount} زيارة محلية</span>
                      <span>{center.availableSpecialtySlots} طبيبًا متاحًا</span>
                      <span>متوسط انتظار {center.averageWaitTime} دقيقة</span>
                    </div>
                  </article>
                )
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="مسار الإحالات"
            subtitle="توزيع حالات الإحالات الطبية بين المراكز."
            action={renderSectionAction(referralsRoute, "صفحة الإحالات")}
          >
            <div className="stack-list compact">
              {centralData.referralPipeline.map((item) =>
                referralsRoute ? (
                  <Link key={item.status} className="stack-item interactive-card" to={referralsRoute}>
                    <div className="info-row">
                      <span>{toArabicLabel(item.status)}</span>
                      <strong>{item.count}</strong>
                    </div>
                    <p className="action-hint">اضغط لفتح الإحالات بهذا التصنيف.</p>
                  </Link>
                ) : (
                  <div key={item.status} className="info-row">
                    <span>{toArabicLabel(item.status)}</span>
                    <strong>{item.count}</strong>
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
                </tr>
              </thead>
              <tbody>
                {centralData.recentReferrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <strong>{referral.patientName}</strong>
                      <span>{referral.patientUnifiedId}</span>
                    </td>
                    <td>
                      <strong>{referral.fromCenter}</strong>
                      <span>{referral.toCenter}</span>
                    </td>
                    <td>
                      <strong>{referral.requiredSpecialty}</strong>
                      <span>{toArabicLabel(referral.priority)}</span>
                    </td>
                    <td>
                      <StatusBadge status={referral.status} />
                    </td>
                    <td>{formatDateTime(referral.requestedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="أحدث الزيارات المتزامنة"
          subtitle="ملخصات الزيارات التي وصلت حديثًا من المراكز المرتبطة."
          action={renderSectionAction(synchronizedVisitsRoute, "فتح المرضى")}
        >
          <div className="card-grid">
            {centralData.recentVisits.map((visit) =>
              synchronizedVisitsRoute ? (
                <Link key={visit.id} className="profile-tile interactive-card" to={synchronizedVisitsRoute}>
                  <p className="eyebrow">{visit.centerName}</p>
                  <h3>{visit.patientName}</h3>
                  <p>{visit.primaryDiagnosis}</p>
                  <div className="tile-stats">
                    <span>{toArabicLabel(visit.visitType)}</span>
                    <span>{formatDateTime(visit.visitDate)}</span>
                  </div>
                  <p className="action-hint">اضغط لفتح السجلات المرتبطة.</p>
                </Link>
              ) : (
                <article key={visit.id} className="profile-tile">
                  <p className="eyebrow">{visit.centerName}</p>
                  <h3>{visit.patientName}</h3>
                  <p>{visit.primaryDiagnosis}</p>
                  <div className="tile-stats">
                    <span>{toArabicLabel(visit.visitType)}</span>
                    <span>{formatDateTime(visit.visitDate)}</span>
                  </div>
                </article>
              )
            )}
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!centerData) {
    return <div className="empty-state">لا توجد بيانات متاحة لهذه الواجهة.</div>;
  }

  const labOrInventoryRoute = user?.center?.hasLabModule
    ? labRoute ?? notificationsRoute ?? visitsRoute
    : pharmacyRoute ?? notificationsRoute ?? patientsRoute;

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">{toArabicLabel(centerData.role)}</p>
          <h1>{centerData.center.name}</h1>
        </div>
        <p className="muted">
          واجهة تشغيل محلية للمركز في {centerData.center.city}. تتغير المسارات داخلها بحسب الدور الوظيفي لتغطي
          الاستقبال والعيادات والتمريض والمختبر والصيدلية.
        </p>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="المرضى المحليون"
          value={centerData.stats.localPatients}
          helper="عدد المرضى المخزنين في قاعدة بيانات المركز المحلي."
          to={patientsRoute}
          actionHint="اضغط لفتح صفحة المرضى."
        />
        <MetricCard
          label="زيارات غير متزامنة"
          value={centerData.stats.unsyncedVisits}
          helper="زيارات بانتظار مزامنتها مع النظام المركزي."
          to={visitsRoute}
          actionHint="اضغط لفتح صفحة الزيارات."
        />
        <MetricCard
          label="طابور وارد"
          value={centerData.stats.incomingPending}
          helper="إشعارات مركزية ما زالت بانتظار المعالجة داخل المركز."
          to={notificationsRoute}
          actionHint="اضغط لفتح صفحة الإشعارات."
        />
        <MetricCard
          label="طابور صادر"
          value={centerData.stats.outgoingPending}
          helper="إشعارات محلية بانتظار الوصول إلى النظام المركزي."
          to={notificationsRoute}
          actionHint="اضغط لفتح صفحة الإشعارات."
        />
        <MetricCard
          label="إحالات مفتوحة"
          value={centerData.stats.openReferrals}
          helper="إحالات مرتبطة بهذا المركز وما زالت تحتاج متابعة."
          to={referralsRoute}
          actionHint="اضغط لفتح صفحة الإحالات."
        />
        <MetricCard
          label={user?.center?.hasLabModule ? "طلبات مختبر مفتوحة" : "أصناف منخفضة المخزون"}
          value={user?.center?.hasLabModule ? centerData.stats.labOpenRequests : centerData.stats.lowStockItems}
          helper={
            user?.center?.hasLabModule
              ? "طلبات فحوصات مخبرية لم تُستكمل بعد."
              : "أصناف دوائية تحتاج إلى تزويد قريب."
          }
          to={labOrInventoryRoute}
          actionHint={user?.center?.hasLabModule ? "اضغط لفتح صفحة المتابعة المناسبة." : "اضغط لفتح صفحة المتابعة المناسبة."}
        />
      </div>

      {user?.role !== "DOCTOR" ? (
      <SectionCard
        title="الإدارة المالية"
        subtitle="الفواتير، واستخدام الميزانية، وتصنيف تكاليف التشغيل داخل هذا المركز."
      >
        <div className="metric-grid">
          <MetricCard
            label="إجمالي الفواتير"
            value={formatCurrency(centerData.financial.invoices.total)}
            helper={`${centerData.financial.invoices.count} فواتير مسجلة للمرضى.`}
          />
          <MetricCard
            label="الفواتير غير المسددة"
            value={formatCurrency(centerData.financial.invoices.outstanding)}
            helper={`${centerData.financial.invoices.unpaidCount} فواتير ما زالت غير مدفوعة أو مدفوعة جزئيًا.`}
          />
          <MetricCard
            label="المستخدم من الميزانية"
            value={`${centerData.financial.budget.utilizationRate}%`}
            helper={`${formatCurrency(centerData.financial.budget.projectedSpend)} إنفاق متوقع من ميزانية شهرية قدرها ${formatCurrency(centerData.financial.budget.monthlyLimit)}.`}
          />
          <MetricCard
            label="المتبقي من الميزانية"
            value={formatCurrency(centerData.financial.budget.remaining)}
            helper="المبلغ المتبقي بعد احتساب الموظفين والأدوية والمعدات وحمل المرضى."
          />
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفئة</th>
                <th>المبلغ</th>
                <th>أساس الاحتساب</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>الموظفون</td>
                <td>{formatCurrency(centerData.financial.expenses.staff)}</td>
                <td>الحسابات النشطة للإدارة والأطباء والاستقبال وفريق الرعاية.</td>
              </tr>
              <tr>
                <td>الأدوية</td>
                <td>{formatCurrency(centerData.financial.expenses.medications)}</td>
                <td>قيمة مخزون الصيدلية الحالي.</td>
              </tr>
              <tr>
                <td>المعدات</td>
                <td>{formatCurrency(centerData.financial.expenses.equipment)}</td>
                <td>كتالوج المختبر والطاقة المتاحة لغرف العمليات.</td>
              </tr>
              <tr>
                <td>المرضى</td>
                <td>{formatCurrency(centerData.financial.expenses.patients)}</td>
                <td>تقدير تكلفة التشغيل لحمل المرضى المحلي.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
      ) : null}

      <div className="split-grid">
        <SectionCard
          title="آخر الزيارات"
          subtitle="أحدث الزيارات المسجلة داخل المركز."
          action={renderSectionAction(visitsRoute, "صفحة الزيارات")}
        >
          <div className="stack-list">
            {centerData.recentVisits.map((visit) =>
              visitsRoute ? (
                <Link key={visit.id} className="stack-item interactive-card" to={visitsRoute}>
                  <div className="info-row">
                    <div>
                      <strong>{visit.patientName}</strong>
                      <p className="muted">{joinMeta([visit.doctorName, toArabicLabel(visit.visitType)])}</p>
                    </div>
                    <StatusBadge status={visit.syncState} />
                  </div>
                  <div className="tile-stats">
                    <span>{visit.diagnosis}</span>
                    <span>{visit.prescriptionCount} وصفات دوائية</span>
                    <span>{formatDateTime(visit.visitDate)}</span>
                  </div>
                  <p className="action-hint">اضغط لفتح صفحة الزيارات.</p>
                </Link>
              ) : (
                <article key={visit.id} className="stack-item">
                  <div className="info-row">
                    <div>
                      <strong>{visit.patientName}</strong>
                      <p className="muted">{joinMeta([visit.doctorName, toArabicLabel(visit.visitType)])}</p>
                    </div>
                    <StatusBadge status={visit.syncState} />
                  </div>
                  <div className="tile-stats">
                    <span>{visit.diagnosis}</span>
                    <span>{visit.prescriptionCount} وصفات دوائية</span>
                    <span>{formatDateTime(visit.visitDate)}</span>
                  </div>
                </article>
              )
            )}
          </div>
        </SectionCard>

        <SectionCard title="فريق العمل حسب الدور" subtitle="يوفر النظام واجهات مختلفة لكل دور داخل المركز الصحي.">
          <div className="stack-list compact">
            {centerData.team.map((member) => {
              const memberRoute = resolveTeamRoute(member.role);

              if (memberRoute) {
                return (
                  <Link key={member.id} className="stack-item interactive-card" to={memberRoute}>
                    <div className="info-row">
                      <div>
                        <strong>{member.fullName}</strong>
                        <p className="muted">{joinMeta([toArabicLabel(member.role), member.specialization])}</p>
                      </div>
                      <StatusBadge status={member.isActive ? "active" : "inactive"} />
                    </div>
                    <p className="action-hint">اضغط لفتح المسار الأنسب لهذا الدور.</p>
                  </Link>
                );
              }

              return (
                <div key={member.id} className="info-row">
                  <div>
                    <strong>{member.fullName}</strong>
                    <p className="muted">{joinMeta([toArabicLabel(member.role), member.specialization])}</p>
                  </div>
                  <StatusBadge status={member.isActive ? "active" : "inactive"} />
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="نشاط الإحالات"
        subtitle="الإحالات الصادرة من هذا المركز أو الواردة إليه."
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
              </tr>
            </thead>
            <tbody>
              {centerData.referrals.map((referral) => (
                <tr key={referral.id}>
                  <td>{referral.patientName}</td>
                  <td>
                    <strong>{referral.fromCenter}</strong>
                    <span>{referral.toCenter}</span>
                  </td>
                  <td>
                    <strong>{referral.requiredSpecialty}</strong>
                    <span>{toArabicLabel(referral.priority)}</span>
                  </td>
                  <td>
                    <StatusBadge status={referral.status} />
                  </td>
                  <td>{formatDateTime(referral.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
