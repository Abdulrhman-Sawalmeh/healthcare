import { useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterWorkspaceData, CentralDashboardData } from "../types";

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

  if (loading) {
    return <div className="empty-state">جارٍ تحميل لوحة المتابعة...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  if (user?.workspace === "central" && centralData) {
    return (
      <div className="page-stack">
        <div className="hero-strip">
          <div>
            <p className="eyebrow">النظام المركزي</p>
            <h1>لوحة متابعة مركزية موحدة للشبكة الصحية</h1>
          </div>
          <p className="muted">
            تتابع هذه اللوحة اتصال المراكز، ومسار الإحالات الطبية، وتغطية السجل الموحد للمرضى،
            وحالة طوابير الإشعارات بين الأنظمة من نقطة إشراف واحدة.
          </p>
        </div>

        <div className="metric-grid">
          <MetricCard
            label="المراكز المتصلة"
            value={centralData.stats.connectedCenters}
            helper="عدد المراكز المسموح لها حاليًا بالتكامل مع النظام المركزي."
          />
          <MetricCard
            label="المراكز الموقوفة"
            value={centralData.stats.suspendedCenters}
            helper="مراكز تم تعليق اتصالها مؤقتًا من قبل الإدارة المركزية."
          />
          <MetricCard
            label="المرضى الموحدون"
            value={centralData.stats.unifiedPatients}
            helper="عدد السجلات الصحية الموحدة المتاحة عبر جميع المراكز."
          />
          <MetricCard
            label="الإحالات المعلقة"
            value={centralData.stats.pendingReferrals}
            helper="طلبات الإحالة التي ما زالت بانتظار التوجيه أو الاستكمال."
          />
          <MetricCard
            label="طابور مركزي معلق"
            value={centralData.stats.pendingCentralNotifications}
            helper="إشعارات ما زال على النظام المركزي معالجتها أو تسليمها."
          />
          <MetricCard
            label="طوابير المراكز الصادرة"
            value={centralData.stats.pendingOutgoingNotifications}
            helper="إشعارات محلية لم تصل بعد إلى النظام المركزي."
          />
        </div>

        <div className="split-grid">
          <SectionCard title="خريطة حمل المراكز" subtitle="الوضع التشغيلي الحالي لكل مركز متصل.">
            <div className="stack-list">
              {centralData.centers.map((center) => (
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
              ))}
            </div>
          </SectionCard>

          <SectionCard title="مسار الإحالات" subtitle="توزيع حالات الإحالات الطبية بين المراكز.">
            <div className="stack-list compact">
              {centralData.referralPipeline.map((item) => (
                <div key={item.status} className="info-row">
                  <span>{toArabicLabel(item.status)}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="أحدث الإحالات" subtitle="آخر طلبات الإحالة ونتائج التوجيه العلاجي.">
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

        <SectionCard title="أحدث الزيارات المزامنة" subtitle="ملخصات الزيارات التي وصلت حديثًا من المراكز المرتبطة.">
          <div className="card-grid">
            {centralData.recentVisits.map((visit) => (
              <article key={visit.id} className="profile-tile">
                <p className="eyebrow">{visit.centerName}</p>
                <h3>{visit.patientName}</h3>
                <p>{visit.primaryDiagnosis}</p>
                <div className="tile-stats">
                  <span>{toArabicLabel(visit.visitType)}</span>
                  <span>{formatDateTime(visit.visitDate)}</span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!centerData) {
    return <div className="empty-state">لا توجد بيانات متاحة لهذه الواجهة.</div>;
  }

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">{toArabicLabel(centerData.role)}</p>
          <h1>{centerData.center.name}</h1>
        </div>
        <p className="muted">
          واجهة تشغيل محلية للمركز في {centerData.center.city}. تتغير المسارات داخلها بحسب الدور
          الوظيفي لتغطي الاستقبال والعيادات والتمريض والمختبر والصيدلية.
        </p>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="المرضى المحليون"
          value={centerData.stats.localPatients}
          helper="عدد المرضى المخزنين في قاعدة بيانات المركز المحلي."
        />
        <MetricCard
          label="زيارات غير مزامنة"
          value={centerData.stats.unsyncedVisits}
          helper="زيارات بانتظار مزامنتها مع النظام المركزي."
        />
        <MetricCard
          label="طابور وارد"
          value={centerData.stats.incomingPending}
          helper="إشعارات مركزية ما زالت بانتظار المعالجة داخل المركز."
        />
        <MetricCard
          label="طابور صادر"
          value={centerData.stats.outgoingPending}
          helper="إشعارات محلية بانتظار الوصول إلى النظام المركزي."
        />
        <MetricCard
          label="إحالات مفتوحة"
          value={centerData.stats.openReferrals}
          helper="إحالات مرتبطة بهذا المركز وما زالت تحتاج متابعة."
        />
        <MetricCard
          label={user?.center?.hasLabModule ? "طلبات مختبر مفتوحة" : "أصناف منخفضة المخزون"}
          value={user?.center?.hasLabModule ? centerData.stats.labOpenRequests : centerData.stats.lowStockItems}
          helper={
            user?.center?.hasLabModule
              ? "طلبات فحوصات مخبرية لم تُستكمل بعد."
              : "أصناف دوائية تحتاج إلى تزويد قريب."
          }
        />
      </div>

      <div className="split-grid">
        <SectionCard title="آخر الزيارات" subtitle="أحدث الزيارات المسجلة داخل المركز.">
          <div className="stack-list">
            {centerData.recentVisits.map((visit) => (
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
            ))}
          </div>
        </SectionCard>

        <SectionCard title="فريق العمل حسب الدور" subtitle="يوفر النظام واجهات مختلفة لكل دور داخل المركز الصحي.">
          <div className="stack-list compact">
            {centerData.team.map((member) => (
              <div key={member.id} className="info-row">
                <div>
                  <strong>{member.fullName}</strong>
                  <p className="muted">{toArabicLabel(member.role)}</p>
                </div>
                <StatusBadge status={member.isActive ? "active" : "inactive"} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="نشاط الإحالات" subtitle="الإحالات الصادرة من هذا المركز أو الواردة إليه.">
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
