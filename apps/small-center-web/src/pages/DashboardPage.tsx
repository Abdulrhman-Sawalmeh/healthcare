import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { isRouteEnabled } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { buildDoctorActionNotifications, DoctorVisitFileNotificationSource } from "../lib/doctor-notifications";
import {
  CenterNotificationsBundle,
  CenterWorkspaceData,
  CentralDashboardData,
  PortalThreadRecord,
  Role
} from "../types";

type WorkflowVisitSummary = {
  id: number;
  visitDate?: string | null;
  visitTime?: string | null;
  visitType?: string | null;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  workflowStatus: string;
  symptoms?: string | null;
  notes?: string | null;
  patient: {
    fullName: string;
    phone: string;
    unifiedId?: string | null;
  };
  doctor?: {
    fullName: string;
  } | null;
};

function isToday(value?: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [centralData, setCentralData] = useState<CentralDashboardData | null>(null);
  const [centerData, setCenterData] = useState<CenterWorkspaceData | null>(null);
  const [intakeQueue, setIntakeQueue] = useState<WorkflowVisitSummary[]>([]);
  const [waitingDoctorQueue, setWaitingDoctorQueue] = useState<WorkflowVisitSummary[]>([]);
  const [doctorActionNotificationCount, setDoctorActionNotificationCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentUser = user;
    const path = currentUser.workspace === "central" ? "/central/dashboard" : "/center/dashboard";

    async function loadDashboard() {
      setLoading(true);
      setDoctorActionNotificationCount(0);
      setIntakeQueue([]);
      setWaitingDoctorQueue([]);

      try {
        const payload = await apiRequest<CentralDashboardData | CenterWorkspaceData>(path);

        if (currentUser.workspace === "central") {
          setCentralData(payload as CentralDashboardData);
          setCenterData(null);
        } else {
          setCenterData(payload as CenterWorkspaceData);
          setCentralData(null);
        }

        if (currentUser.workspace === "center" && currentUser.role === "RECEPTIONIST") {
          const [intakeResult, waitingDoctorResult] = await Promise.allSettled([
            apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow?status=WAITING_RECEPTION"),
            apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow?status=WAITING_DOCTOR")
          ]);

          setIntakeQueue(intakeResult.status === "fulfilled" ? intakeResult.value : []);
          setWaitingDoctorQueue(
            waitingDoctorResult.status === "fulfilled" ? waitingDoctorResult.value : []
          );
        }

        if (currentUser.workspace === "center" && currentUser.role === "DOCTOR") {
          const [notificationsResult, threadsResult, visitFilesResult] = await Promise.allSettled([
            apiRequest<CenterNotificationsBundle>("/center/notifications"),
            apiRequest<PortalThreadRecord[]>("/portal/communications/threads"),
            apiRequest<DoctorVisitFileNotificationSource[]>("/center/visit-workflow?status=WAITING_DOCTOR")
          ]);

          const actionItems = buildDoctorActionNotifications({
            centerBundle: notificationsResult.status === "fulfilled" ? notificationsResult.value : null,
            threads: threadsResult.status === "fulfilled" ? threadsResult.value : [],
            visitFiles: visitFilesResult.status === "fulfilled" ? visitFilesResult.value : [],
            role: currentUser.role,
            workspace: currentUser.workspace
          });

          setDoctorActionNotificationCount(actionItems.length);
        }

        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "تعذر تحميل لوحة المتابعة.");
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [user]);

  const centersRoute = isRouteEnabled("/centers") ? "/centers" : undefined;
  const patientsRoute = isRouteEnabled("/patients") ? "/patients" : undefined;
  const visitsRoute = isRouteEnabled("/visits") ? "/visits" : undefined;
  const visitWorkflowRoute = isRouteEnabled("/visit-workflow") ? "/visit-workflow" : visitsRoute;
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

  if (user?.role === "RECEPTIONIST") {
    const todayWaitingDoctor = waitingDoctorQueue.filter((visit) => isToday(visit.visitDate)).length;
    const incompleteIntakeCount = intakeQueue.filter(
      (visit) => !visit.doctor || !visit.visitDate || !visit.patient.phone
    ).length;

    return (
      <div className="page-stack">
        <div className="hero-strip">
          <div>
            <p className="eyebrow">مساحة الاستقبال</p>
            <h1>تسجيل المرضى وتحويل الزيارات إلى الطبيب</h1>
          </div>
          <p className="muted">
            تركز هذه اللوحة على إنشاء ملفات المرضى، تسجيل الزيارة الأولية، متابعة الطابور، وتسليم الملف للطبيب دون عرض تفاصيل التشخيص أو الوصفات.
          </p>
        </div>

        <div className="metric-grid">
          <MetricCard
            label="بانتظار الاستقبال"
            value={intakeQueue.length}
            helper="زيارات تحتاج استكمال بيانات الوصول أو تعيين الطبيب قبل دخولها طابور الطبيب."
            to={visitWorkflowRoute ? `${visitWorkflowRoute}?status=WAITING_RECEPTION` : undefined}
            actionHint="اضغط لفتح ملفات الزيارة بانتظار الاستقبال."
          />
          <MetricCard
            label="بانتظار الطبيب"
            value={waitingDoctorQueue.length}
            helper="زيارات تم تسجيلها وتحويلها إلى الطبيب لمتابعة التقييم السريري."
            to={visitWorkflowRoute ? `${visitWorkflowRoute}?status=WAITING_DOCTOR` : undefined}
            actionHint="اضغط لفتح طابور الطبيب."
          />
          <MetricCard
            label="زيارات اليوم"
            value={todayWaitingDoctor}
            helper="عدد الزيارات المسجلة اليوم والموجودة حاليا في طابور الطبيب."
            to={visitWorkflowRoute}
            actionHint="اضغط لمراجعة زيارات اليوم."
          />
          <MetricCard
            label="ملفات مرضى"
            value={centerData.stats.localPatients}
            helper="ملفات المرضى المحلية التي يمكن للاستقبال البحث فيها أو إنشاء ملفات جديدة."
            to={patientsRoute}
            actionHint="اضغط لفتح صفحة المرضى."
          />
          <MetricCard
            label="بيانات تحتاج استكمال"
            value={incompleteIntakeCount}
            helper="زيارات ينقصها تعيين طبيب أو بيانات أساسية قبل تسليمها بشكل واضح."
            to={visitWorkflowRoute}
            actionHint="اضغط لاستكمال بيانات الزيارة."
          />
          <MetricCard
            label="إشعارات تسليم ومزامنة"
            value={centerData.stats.outgoingPending}
            helper="رسائل حسابات مرضى أو مزامنة زيارات ما زالت بحاجة متابعة تشغيلية."
            to={notificationsRoute}
            actionHint="اضغط لفتح إشعارات الاستقبال."
          />
        </div>

        <div className="split-grid">
          <SectionCard
            title="إجراءات الاستقبال السريعة"
            subtitle="المسارات اليومية: ملف مريض، زيارة أولية، ثم تسليم للطبيب."
          >
            <div className="stack-list compact">
              {patientsRoute ? (
                <Link className="stack-item interactive-card" to={patientsRoute}>
                  <strong>تسجيل أو البحث عن مريض</strong>
                  <p className="muted">إنشاء ملف وحساب مريض أو العثور على ملف موجود قبل تسجيل الزيارة.</p>
                  <p className="action-hint">فتح المرضى</p>
                </Link>
              ) : null}
              {visitWorkflowRoute ? (
                <Link className="stack-item interactive-card" to={visitWorkflowRoute}>
                  <strong>تسجيل زيارة أولية</strong>
                  <p className="muted">إدخال سبب الوصول والأولوية والطبيب إن كان معروفا، ثم تحويل الملف للطبيب.</p>
                  <p className="action-hint">فتح ملفات الزيارة</p>
                </Link>
              ) : null}
              {notificationsRoute ? (
                <Link className="stack-item interactive-card" to={notificationsRoute}>
                  <strong>متابعة إشعارات الاستقبال</strong>
                  <p className="muted">مراجعة رسائل حسابات المرضى وحالة المزامنة والتنبيهات المرتبطة بالطابور.</p>
                  <p className="action-hint">فتح الإشعارات</p>
                </Link>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="بانتظار الطبيب"
            subtitle="آخر الملفات التي سلمها الاستقبال إلى الطبيب."
            action={renderSectionAction(visitWorkflowRoute ? `${visitWorkflowRoute}?status=WAITING_DOCTOR` : undefined, "فتح الطابور")}
          >
            <div className="stack-list">
              {waitingDoctorQueue.slice(0, 6).map((visit) => (
                <Link
                  key={visit.id}
                  className="stack-item interactive-card"
                  to={visitWorkflowRoute ? `${visitWorkflowRoute}?visitId=${visit.id}` : "#"}
                >
                  <div className="info-row">
                    <div>
                      <strong>{visit.patient.fullName}</strong>
                      <p className="muted">
                        {joinMeta([
                          visit.patient.phone,
                          visit.doctor?.fullName ?? "لم يحدد طبيب",
                          visit.visitType ? toArabicLabel(visit.visitType) : null
                        ])}
                      </p>
                    </div>
                    <StatusBadge status={visit.priority} />
                  </div>
                  <p className="muted">{visit.visitDate ? formatDateTime(visit.visitDate) : "بدون تاريخ مسجل"}</p>
                </Link>
              ))}
              {waitingDoctorQueue.length === 0 ? (
                <div className="empty-state compact">لا توجد ملفات بانتظار الطبيب حاليا.</div>
              ) : null}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="بانتظار الاستقبال"
          subtitle="زيارات تحتاج استكمال بيانات أو تعيين طبيب قبل تسليمها."
          action={renderSectionAction(visitWorkflowRoute ? `${visitWorkflowRoute}?status=WAITING_RECEPTION` : undefined, "فتح القائمة")}
        >
          <div className="stack-list compact">
            {intakeQueue.slice(0, 6).map((visit) => (
              <Link
                key={visit.id}
                className="stack-item interactive-card"
                to={visitWorkflowRoute ? `${visitWorkflowRoute}?visitId=${visit.id}` : "#"}
              >
                <div className="info-row">
                  <div>
                    <strong>{visit.patient.fullName}</strong>
                    <p className="muted">{joinMeta([visit.patient.phone, visit.symptoms, visit.notes])}</p>
                  </div>
                  <StatusBadge status={visit.workflowStatus} />
                </div>
                <p className="action-hint">استكمال بيانات الوصول أو تعيين الطبيب</p>
              </Link>
            ))}
            {intakeQueue.length === 0 ? (
              <div className="empty-state compact">لا توجد زيارات معلقة عند الاستقبال حاليا.</div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    );
  }

  if (user?.role === "DOCTOR") {
    return (
      <div className="page-stack">
        <div className="hero-strip">
          <div>
            <p className="eyebrow">مساحة الطبيب</p>
            <h1>متابعة الزيارات والإحالات السريرية</h1>
          </div>
          <p className="muted">
            تعرض هذه اللوحة ملفات الزيارة المرتبطة بك، والإحالات المسندة لك، والتنبيهات التي تحتاج متابعة سريرية.
          </p>
        </div>

        <div className="metric-grid">
          <MetricCard
            label="ملفات بانتظارك"
            value={centerData.stats.doctorWaitingFiles ?? 0}
            helper="زيارات تحتاج بدء المعالجة أو استكمال تقييم الطبيب."
            to={visitsRoute}
            actionHint="اضغط لفتح ملفات الزيارة."
          />
          <MetricCard
            label="زيارات اليوم"
            value={centerData.stats.doctorTodayVisits ?? 0}
            helper="عدد الزيارات المسجلة لك بتاريخ اليوم."
            to={visitsRoute}
            actionHint="اضغط لمراجعة زيارات اليوم."
          />
          <MetricCard
            label="قيد المعالجة"
            value={centerData.stats.doctorInTreatment ?? 0}
            helper="ملفات بدأت معالجتها ولم تكتمل بعد."
            to={visitsRoute}
            actionHint="اضغط للمتابعة."
          />
          <MetricCard
            label="إحالات مسندة لي"
            value={centerData.stats.doctorAssignedReferrals ?? 0}
            helper="إحالات قبلها المركز وتم إسنادها لك."
            to={referralsRoute ? `${referralsRoute}?view=assigned` : undefined}
            actionHint="اضغط لفتح إحالاتك."
          />
          <MetricCard
            label="تنبيهات تحتاج إجراء"
            value={doctorActionNotificationCount}
            helper="إشعارات سريرية مرتبطة بدور الطبيب."
            to={notificationsRoute}
            actionHint="اضغط لفتح الإشعارات."
          />
        </div>

        <div className="split-grid">
          <SectionCard
            title="زياراتي الأخيرة"
            subtitle="آخر ملفات الزيارة المسندة للطبيب الحالي."
            action={renderSectionAction(visitsRoute, "فتح ملفات الزيارة")}
          >
            {centerData.recentVisits.length === 0 ? (
              <div className="empty-state compact">لا توجد زيارات مسندة لك حاليًا.</div>
            ) : (
              <div className="stack-list">
                {centerData.recentVisits.map((visit) =>
                  visitsRoute ? (
                    <Link key={visit.id} className="stack-item interactive-card" to={visitsRoute}>
                      <div className="info-row">
                        <div>
                          <strong>{visit.patientName}</strong>
                          <p className="muted">{joinMeta([toArabicLabel(visit.visitType), visit.diagnosis])}</p>
                        </div>
                        <StatusBadge status={visit.syncState} />
                      </div>
                      <div className="tile-stats">
                        <span>{formatDateTime(visit.visitDate)}</span>
                        <span>{visit.prescriptionCount} وصفات لهذه الزيارة</span>
                      </div>
                      <p className="action-hint">اضغط لفتح الزيارة ومراجعة التقارير.</p>
                    </Link>
                  ) : (
                    <article key={visit.id} className="stack-item">
                      <strong>{visit.patientName}</strong>
                      <p className="muted">{joinMeta([toArabicLabel(visit.visitType), visit.diagnosis])}</p>
                    </article>
                  )
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="إحالاتي السريرية"
            subtitle="الإحالات المرتبطة بالطبيب الحالي للبدء أو المتابعة أو الإغلاق."
            action={renderSectionAction(referralsRoute ? `${referralsRoute}?view=assigned` : undefined, "فتح الإحالات")}
          >
            {centerData.referrals.length === 0 ? (
              <div className="empty-state compact">لا توجد إحالات مسندة لك حاليًا.</div>
            ) : (
              <div className="stack-list">
                {centerData.referrals.map((referral) =>
                  referralsRoute ? (
                    <Link
                      key={referral.id}
                      className="stack-item interactive-card"
                      to={`${referralsRoute}?view=assigned&referralId=${referral.id}`}
                    >
                      <div className="info-row">
                        <div>
                          <strong>{referral.patientName}</strong>
                          <p className="muted">{joinMeta([referral.requiredSpecialty, toArabicLabel(referral.priority)])}</p>
                        </div>
                        <StatusBadge status={referral.status} />
                      </div>
                      <p className="muted">{formatDateTime(referral.requestedAt)}</p>
                    </Link>
                  ) : (
                    <article key={referral.id} className="stack-item">
                      <strong>{referral.patientName}</strong>
                      <p className="muted">{referral.requiredSpecialty}</p>
                    </article>
                  )
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    );
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
