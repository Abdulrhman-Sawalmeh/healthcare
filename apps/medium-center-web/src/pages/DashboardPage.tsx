import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterWorkspaceData, CentralDashboardData, LabBundle, ReferralRecord, Role } from "../types";

type WorkflowVisitSummary = {
  id: number;
  visitDate: string;
  visitTime?: string | null;
  visitType: string;
  priority: string;
  workflowStatus: string;
  symptoms?: string | null;
  diagnosis?: string | null;
  patient: {
    fullName: string;
    phone?: string | null;
    unifiedId?: string | null;
  };
  doctor?: {
    id?: number;
    fullName: string;
  } | null;
  labRequests?: Array<{
    status: string;
    resultValue?: string | null;
    resultDate?: string | null;
    test: {
      testName: string;
    };
  }>;
  prescriptions?: Array<{
    dispensed: boolean;
  }>;
};

function roleRoute(role: Role) {
  switch (role) {
    case "CENTER_MANAGER":
      return "/referrals?view=incoming";
    case "DOCTOR":
      return "/visit-workflow?status=WAITING_DOCTOR";
    case "RECEPTIONIST":
      return "/visit-workflow?status=WAITING_RECEPTION";
    case "LAB_TECH":
      return "/visit-workflow?status=WAITING_LAB";
    case "PHARMACIST":
      return "/visit-workflow?status=WAITING_PHARMACY";
    case "NURSE":
      return "/visit-workflow?status=WAITING_TRIAGE";
    default:
      return "/notifications";
  }
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function shortList<T>({
  items,
  empty,
  render
}: {
  items: T[];
  empty: string;
  render: (item: T) => ReactNode;
}) {
  return (
    <div className="stack-list compact">
      {items.slice(0, 5).map(render)}
      {items.length === 0 ? <div className="empty-state compact">{empty}</div> : null}
    </div>
  );
}

function TeamSummary({ centerData }: { centerData: CenterWorkspaceData }) {
  const summary = useMemo(() => {
    const active = centerData.team.filter((member) => member.isActive).length;

    return {
      active,
      inactive: centerData.team.length - active,
      doctors: centerData.team.filter((member) => member.role === "DOCTOR" && member.isActive).length,
      care: centerData.team.filter((member) => ["NURSE", "LAB_TECH", "PHARMACIST"].includes(member.role) && member.isActive).length
    };
  }, [centerData.team]);

  return (
    <SectionCard
      title="حالة الفريق"
      subtitle="جاهزية الطاقم حسب الدور داخل المركز."
      action={<Link className="ghost-button" to="/doctors">الأطباء</Link>}
    >
      <div className="staff-status-grid">
        {centerData.team.map((member) => (
          <Link key={member.id} className="staff-status-card interactive-card" to={roleRoute(member.role)}>
            <div>
              <strong>{member.fullName}</strong>
              <p className="muted">{joinMeta([toArabicLabel(member.role), member.specialization])}</p>
            </div>
            <StatusBadge status={member.isActive ? "active" : "inactive"} />
          </Link>
        ))}
      </div>
      {summary.inactive > 0 ? <div className="inline-note">يوجد {summary.inactive} حساب غير نشط ضمن الفريق.</div> : null}
    </SectionCard>
  );
}

function ManagerDashboard({ centerData }: { centerData: CenterWorkspaceData }) {
  return (
    <div className="page-stack manager-dashboard">
      <div className="hero-strip manager-hero">
        <div>
          <p className="eyebrow">{toArabicLabel(centerData.role)}</p>
          <h1>{centerData.center.name}</h1>
          <p className="muted">
            متابعة تشغيلية للإحالات، الزيارات غير المتزامنة، المختبر، جاهزية الفريق، والتنبيهات.
          </p>
        </div>
        <div className="button-row hero-actions">
          <Link className="primary-button" to="/referrals?view=incoming">إدارة الإحالات الواردة</Link>
          <Link className="ghost-button" to="/notifications">فتح التنبيهات</Link>
        </div>
      </div>

      <div className="metric-grid compact-metrics">
        <MetricCard label="الإحالات المفتوحة" value={centerData.stats.openReferrals} helper="طلبات تحتاج قرارًا أو إسنادًا أو متابعة." to="/referrals" actionHint="فتح سجل الإحالات" />
        <MetricCard label="إحالات واردة بانتظار القرار" value={centerData.stats.incomingPending} helper="إحالات تحتاج مراجعة المدير." to="/referrals?view=incoming" actionHint="مراجعة الوارد" />
        <MetricCard label="زيارات غير متزامنة" value={centerData.stats.unsyncedVisits} helper="زيارات محلية لم تصل بعد للنظام المركزي." to="/visits" actionHint="متابعة الزيارات" />
        <MetricCard label="طلبات مختبر مفتوحة" value={centerData.stats.labOpenRequests} helper="فحوصات بانتظار التنفيذ أو النتيجة." to="/visit-workflow?status=WAITING_LAB" actionHint="فتح المختبر" />
        <MetricCard label="تنبيهات صادرة" value={centerData.stats.outgoingPending} helper="رسائل أو مزامنات لم تكتمل بعد." to="/notifications" actionHint="فتح الإشعارات" />
        <MetricCard label="الفريق النشط" value={centerData.team.filter((member) => member.isActive).length} helper="حسابات تشغيلية فعالة داخل المركز." to="/doctors" actionHint="إدارة الفريق" />
      </div>

      <div className="split-grid dashboard-focus-grid">
        <SectionCard title="آخر الزيارات" subtitle="قراءة سريعة للزيارات الحديثة وحالة مزامنتها." action={<Link className="ghost-button" to="/visits">فتح الزيارات</Link>}>
          {shortList({
            items: centerData.recentVisits,
            empty: "لا توجد زيارات حديثة.",
            render: (visit) => (
              <Link key={visit.id} className="stack-item interactive-card" to={`/visits?visitId=${visit.id}`}>
                <div className="info-row">
                  <div>
                    <strong>{visit.patientName}</strong>
                    <p className="muted">{joinMeta([visit.doctorName, toArabicLabel(visit.visitType)])}</p>
                  </div>
                  <StatusBadge status={visit.syncState} />
                </div>
                <div className="tile-stats">
                  <span>{visit.diagnosis}</span>
                  <span>{visit.prescriptionCount} وصفات</span>
                  <span>{formatDateTime(visit.visitDate)}</span>
                </div>
              </Link>
            )
          })}
        </SectionCard>
        <TeamSummary centerData={centerData} />
      </div>

      <SectionCard title="نشاط الإحالات" subtitle="المسار الإداري للإحالات الواردة والصادرة من هذا المركز." action={<Link className="primary-button" to="/referrals?view=incoming">إدارة الإحالات الواردة</Link>}>
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
                <tr key={referral.id} id={`referral-${referral.id}`}>
                  <td>{referral.patientName}</td>
                  <td>
                    <strong>{referral.fromCenter}</strong>
                    <span>{referral.toCenter}</span>
                  </td>
                  <td>
                    <strong>{referral.requiredSpecialty}</strong>
                    <span>{toArabicLabel(referral.priority)}</span>
                  </td>
                  <td><StatusBadge status={referral.status} /></td>
                  <td>{formatDateTime(referral.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {centerData.referrals.length === 0 ? <div className="empty-state compact">لا توجد إحالات حديثة.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function DoctorDashboard({
  centerData,
  assignedReferrals,
  waitingVisits,
  inTreatmentVisits,
  labReviewVisits,
  doctorName
}: {
  centerData: CenterWorkspaceData;
  assignedReferrals: ReferralRecord[];
  waitingVisits: WorkflowVisitSummary[];
  inTreatmentVisits: WorkflowVisitSummary[];
  labReviewVisits: WorkflowVisitSummary[];
  doctorName: string;
}) {
  const myVisitsToday = centerData.recentVisits.filter(
    (visit) => visit.doctorName === doctorName && isToday(visit.visitDate)
  );
  const pendingAssigned = assignedReferrals.filter((referral) => !["COMPLETED", "CANCELLED"].includes(referral.status));
  const activePrescriptionVisits = inTreatmentVisits.filter((visit) =>
    visit.prescriptions?.some((prescription) => !prescription.dispensed)
  );

  return (
    <div className="page-stack role-dashboard doctor-dashboard">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">لوحة الطبيب</p>
          <h1>عملك السريري اليوم</h1>
          <p className="muted">زياراتك، الحالات بانتظار التقييم، الإحالات المسندة، ونتائج المختبر التي تحتاج مراجعة.</p>
        </div>
        <div className="button-row hero-actions">
          <Link className="primary-button" to="/referrals?view=assigned">الإحالات المسندة لي</Link>
          <Link className="ghost-button" to="/visit-workflow?status=WAITING_DOCTOR">فتح الحالة التالية</Link>
        </div>
      </section>

      <div className="metric-grid compact-metrics">
        <MetricCard label="زياراتي اليوم" value={myVisitsToday.length} helper="زيارات مرتبطة باسم الطبيب اليوم." to="/visit-workflow" actionHint="فتح الزيارات" />
        <MetricCard label="حالات بانتظار تقييمي" value={waitingVisits.length} helper="ملفات جاهزة لتقييم الطبيب." to="/visit-workflow?status=WAITING_DOCTOR" actionHint="فتح الحالة التالية" />
        <MetricCard label="الإحالات المسندة لي" value={pendingAssigned.length} helper="إحالات تحتاج فتح تفاصيل أو بدء زيارة." to="/referrals?view=assigned" actionHint="مراجعة الإحالات المسندة" />
        <MetricCard label="زيارات قيد المعالجة" value={inTreatmentVisits.length} helper="حالات بدأ العمل عليها ولم تكتمل." to="/visit-workflow?status=IN_TREATMENT" actionHint="متابعة العلاج" />
        <MetricCard label="نتائج مختبر تحتاج مراجعة" value={labReviewVisits.length} helper="نتائج مكتملة ضمن ملفات قيد المتابعة." to="/visit-workflow?status=WAITING_DOCTOR" actionHint="مراجعة النتائج" />
        <MetricCard label="وصفات تحتاج إجراء" value={activePrescriptionVisits.length} helper="وصفات أو متابعات ما زالت مفتوحة." to="/visit-workflow?status=IN_TREATMENT" actionHint="متابعة الوصفات" />
      </div>

      <section className="section-card quick-action-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">اختصارات الطبيب</p>
            <h3>إجراءات سريعة</h3>
          </div>
        </div>
        <div className="button-row">
          <Link className="primary-button" to="/visit-workflow?status=WAITING_DOCTOR">فتح الحالة التالية</Link>
          <Link className="ghost-button" to="/referrals?view=assigned">مراجعة الإحالات المسندة</Link>
          <Link className="ghost-button" to="/patients">إنشاء تذكير متابعة</Link>
          <Link className="ghost-button" to="/visit-workflow">طلب مختبر</Link>
          <Link className="ghost-button" to="/visit-workflow">إنشاء وصفة</Link>
        </div>
      </section>

      <div className="split-grid dashboard-focus-grid">
        <SectionCard title="الإحالات المسندة للطبيب" subtitle="الإحالات التي تم إسنادها لك أو بدأت زيارتها." action={<Link className="primary-button" to="/referrals?view=assigned">فتح الإحالات</Link>}>
          {shortList({
            items: assignedReferrals,
            empty: "لا توجد إحالات مسندة لك حاليًا.",
            render: (referral) => (
              <Link key={referral.id} className="stack-item interactive-card" id={`referral-${referral.id}`} to={`/referrals?view=assigned&referralId=${referral.id}`}>
                <div className="info-row">
                  <div>
                    <strong>{referral.patientName ?? referral.patientUnifiedId}</strong>
                    <p className="muted">{joinMeta([referral.requiredSpecialty, referral.fromCenter])}</p>
                  </div>
                  <StatusBadge status={referral.status} />
                </div>
                <div className="tile-stats">
                  <span>{toArabicLabel(referral.priority)}</span>
                  <span>{formatDateTime(referral.requestedAt)}</span>
                </div>
              </Link>
            )
          })}
        </SectionCard>

        <SectionCard title="حالات بانتظار الطبيب" subtitle="ملفات جاهزة للتقييم السريري." action={<Link className="ghost-button" to="/visit-workflow?status=WAITING_DOCTOR">فتح قائمة الانتظار</Link>}>
          {shortList({
            items: waitingVisits,
            empty: "لا توجد حالات بانتظار تقييمك الآن.",
            render: (visit) => (
              <Link key={visit.id} className="stack-item interactive-card" id={`visit-${visit.id}`} to={`/visit-workflow?visitId=${visit.id}`}>
                <div className="info-row">
                  <div>
                    <strong>{visit.patient.fullName}</strong>
                    <p className="muted">{visit.symptoms ?? "لا توجد أعراض أولية مسجلة."}</p>
                  </div>
                  <StatusBadge status={visit.workflowStatus} />
                </div>
                <div className="tile-stats">
                  <span>{toArabicLabel(visit.visitType)}</span>
                  <span>{toArabicLabel(visit.priority)}</span>
                  <span>{formatDateTime(visit.visitDate)}</span>
                </div>
              </Link>
            )
          })}
        </SectionCard>
      </div>
    </div>
  );
}

function ReceptionDashboard({
  centerData,
  intakeQueue,
  waitingDoctor,
  todayVisits
}: {
  centerData: CenterWorkspaceData;
  intakeQueue: WorkflowVisitSummary[];
  waitingDoctor: WorkflowVisitSummary[];
  todayVisits: CenterWorkspaceData["recentVisits"];
}) {
  return (
    <div className="page-stack role-dashboard receptionist-dashboard">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">لوحة الاستقبال</p>
          <h1>التسجيل وقائمة الانتظار</h1>
          <p className="muted">تسجيل المرضى، فتح زيارة أولية، متابعة الوصول، وتحويل الملف للطبيب دون إدخال قرارات سريرية.</p>
        </div>
        <div className="button-row hero-actions">
          <Link className="primary-button" to="/patients">تسجيل مريض / فتح ملف</Link>
          <Link className="ghost-button" to="/visit-workflow">تسجيل زيارة أولية</Link>
        </div>
      </section>

      <div className="metric-grid compact-metrics">
        <MetricCard label="مواعيد اليوم" value={todayVisits.length} helper="زيارات اليوم الظاهرة في سجل المركز." to="/visits" actionHint="عرض مواعيد اليوم" />
        <MetricCard label="مرضى بانتظار التسجيل" value={intakeQueue.length} helper="ملفات وصلت للاستقبال وتحتاج استكمال بيانات الوصول." to="/visit-workflow?status=WAITING_RECEPTION" actionHint="فتح قائمة التسجيل" />
        <MetricCard label="زيارات بانتظار الطبيب" value={waitingDoctor.length} helper="ملفات تم تجهيزها للطبيب." to="/visit-workflow?status=WAITING_DOCTOR" actionHint="متابعة القائمة" />
        <MetricCard label="إجمالي ملفات المرضى" value={centerData.stats.localPatients} helper="ملفات محلية داخل المركز." to="/patients" actionHint="بحث / تسجيل مريض" />
        <MetricCard label="ملفات تحتاج استكمال" value={intakeQueue.filter((visit) => !visit.patient.phone || !visit.symptoms).length} helper="بيانات اتصال أو أعراض أولية ناقصة." to="/visit-workflow?status=WAITING_RECEPTION" actionHint="استكمال البيانات" />
        <MetricCard label="تنبيهات المركز" value={centerData.stats.outgoingPending} helper="رسائل ومزامنات تحتاج متابعة إدارية." to="/notifications" actionHint="فتح الإشعارات" />
      </div>

      <section className="section-card quick-action-panel">
        <div className="button-row">
          <Link className="primary-button" to="/patients">تسجيل مريض / فتح ملف</Link>
          <Link className="ghost-button" to="/visit-workflow">تسجيل زيارة أولية</Link>
          <Link className="ghost-button" to="/visit-workflow?status=WAITING_RECEPTION">قائمة الانتظار</Link>
          <Link className="ghost-button" to="/visits">مواعيد اليوم</Link>
        </div>
      </section>

      <div className="split-grid dashboard-focus-grid">
        <SectionCard title="قائمة الوصول" subtitle="حالات بانتظار استقبال أو استكمال بيانات أولية." action={<Link className="primary-button" to="/visit-workflow?status=WAITING_RECEPTION">فتح الاستقبال</Link>}>
          {shortList({
            items: intakeQueue,
            empty: "لا توجد حالات بانتظار التسجيل الآن.",
            render: (visit) => (
              <Link key={visit.id} className="stack-item interactive-card" id={`visit-${visit.id}`} to={`/visit-workflow?visitId=${visit.id}`}>
                <div className="info-row">
                  <div>
                    <strong>{visit.patient.fullName}</strong>
                    <p className="muted">{joinMeta([visit.patient.phone, visit.symptoms ?? "أعراض أولية غير مسجلة"])}</p>
                  </div>
                  <StatusBadge status={visit.workflowStatus} />
                </div>
                <div className="tile-stats">
                  <span>{toArabicLabel(visit.visitType)}</span>
                  <span>{toArabicLabel(visit.priority)}</span>
                  <span>{formatDateTime(visit.visitDate)}</span>
                </div>
              </Link>
            )
          })}
        </SectionCard>

        <SectionCard title="ملفات جاهزة للطبيب" subtitle="حالات تم تسجيلها وتنتظر الطبيب فقط." action={<Link className="ghost-button" to="/visit-workflow?status=WAITING_DOCTOR">متابعة الطبيب</Link>}>
          {shortList({
            items: waitingDoctor,
            empty: "لا توجد زيارات بانتظار الطبيب الآن.",
            render: (visit) => (
              <Link key={visit.id} className="stack-item interactive-card" to={`/visit-workflow?visitId=${visit.id}`}>
                <div className="info-row">
                  <div>
                    <strong>{visit.patient.fullName}</strong>
                    <p className="muted">{visit.doctor?.fullName ?? "طبيب غير محدد"}</p>
                  </div>
                  <StatusBadge status={visit.workflowStatus} />
                </div>
                <div className="tile-stats">
                  <span>{toArabicLabel(visit.visitType)}</span>
                  <span>{formatDateTime(visit.visitDate)}</span>
                </div>
              </Link>
            )
          })}
        </SectionCard>
      </div>
    </div>
  );
}

function LabDashboard({ labData }: { labData: LabBundle | null }) {
  const requests = labData?.requests ?? [];
  const criticalRequests = requests.filter((request) => request.priority === "CRITICAL" || request.abnormalFlag === "CRITICAL");
  const overdueRequests = requests.filter((request) => {
    if (["SENT_TO_DOCTOR", "PUBLISHED_TO_PATIENT", "CANCELLED", "INVALID_SAMPLE", "COMPLETED"].includes(request.status)) {
      return false;
    }

    return Date.now() - new Date(request.requestDate).getTime() > 24 * 60 * 60 * 1000;
  });
  const todayReports = requests.filter(
    (request) =>
      (request.resultDate && isToday(request.resultDate)) ||
      (request.sentToDoctorAt && isToday(request.sentToDoctorAt)) ||
      (request.publishedToPatientAt && isToday(request.publishedToPatientAt))
  );

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">واجهة فني المختبر</p>
          <h1>متابعة طلبات ونتائج المختبر</h1>
          <p className="muted">طلبات العينات، إدخال النتائج، الحالات الحرجة، وإرسال التقارير للطبيب من مكان واحد.</p>
        </div>
        <div className="button-row hero-actions">
          <Link className="primary-button" to="/lab">
            فتح لوحة المختبر
          </Link>
          <Link className="ghost-button" to="/notifications">
            الإشعارات
          </Link>
        </div>
      </section>

      <div className="metric-grid compact-metrics">
        <MetricCard label="طلبات جديدة" value={requests.filter((request) => ["NEW", "PENDING"].includes(request.status)).length} helper="طلبات لم تبدأ بعد" to="/lab?status=NEW" actionHint="عرض" />
        <MetricCard label="بانتظار العينة" value={requests.filter((request) => request.status === "PENDING_SAMPLE").length} helper="تحتاج استلام عينة" to="/lab?status=PENDING_SAMPLE" actionHint="عرض" />
        <MetricCard label="العينة مستلمة" value={requests.filter((request) => request.status === "SAMPLE_RECEIVED").length} helper="جاهزة للفحص" to="/lab?status=SAMPLE_RECEIVED" actionHint="عرض" />
        <MetricCard label="قيد الفحص" value={requests.filter((request) => ["IN_PROGRESS", "NEEDS_CORRECTION"].includes(request.status)).length} helper="قيد الإدخال أو التصحيح" to="/lab?status=IN_PROGRESS" actionHint="عرض" />
        <MetricCard label="جاهزة للإرسال" value={requests.filter((request) => ["RESULT_READY", "COMPLETED"].includes(request.status)).length} helper="تحتاج إرسال للطبيب" to="/lab?status=RESULT_READY" actionHint="عرض" />
        <MetricCard label="نتائج حرجة" value={criticalRequests.length} helper="تنبيهات عاجلة للطبيب" to="/lab?critical=1" actionHint="عرض" />
        <MetricCard label="طلبات متأخرة" value={overdueRequests.length} helper="أكثر من 24 ساعة" />
        <MetricCard label="تقارير اليوم" value={todayReports.length} helper="نتائج أُنجزت اليوم" />
      </div>

      <SectionCard title="أحدث طلبات المختبر" subtitle="قائمة مختصرة للمتابعة السريعة.">
        <div className="stack-list compact">
          {requests.slice(0, 6).map((request) => (
            <Link key={request.id} className="stack-item interactive-card" to={`/lab?highlight=lab-request-${request.id}`}>
              <div>
                <strong>{request.patientName}</strong>
                <p className="muted">{joinMeta([request.testName, request.doctorName, formatDateTime(request.requestDate)])}</p>
              </div>
              <StatusBadge status={request.status} />
            </Link>
          ))}
          {requests.length === 0 ? <div className="empty-state compact">لا توجد طلبات مختبر حاليًا.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<CentralDashboardData | CenterWorkspaceData | null>(null);
  const [assignedReferrals, setAssignedReferrals] = useState<ReferralRecord[]>([]);
  const [waitingVisits, setWaitingVisits] = useState<WorkflowVisitSummary[]>([]);
  const [inTreatmentVisits, setInTreatmentVisits] = useState<WorkflowVisitSummary[]>([]);
  const [labReviewVisits, setLabReviewVisits] = useState<WorkflowVisitSummary[]>([]);
  const [intakeQueue, setIntakeQueue] = useState<WorkflowVisitSummary[]>([]);
  const [waitingDoctorQueue, setWaitingDoctorQueue] = useState<WorkflowVisitSummary[]>([]);
  const [labData, setLabData] = useState<LabBundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isActive = true;
    const currentUser = user;
    const path = user.workspace === "central" ? "/central/dashboard" : "/center/dashboard";

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<CentralDashboardData | CenterWorkspaceData>(path);
        const tasks: Array<Promise<void>> = [];

        if (currentUser.role === "DOCTOR") {
          tasks.push(apiRequest<ReferralRecord[]>("/center/referrals/assigned-to-me").then(setAssignedReferrals));
          tasks.push(apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow?status=WAITING_DOCTOR").then(setWaitingVisits));
          tasks.push(apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow?status=IN_TREATMENT").then(setInTreatmentVisits));
          tasks.push(
            apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow").then((visits) => {
              setLabReviewVisits(
                visits.filter((visit) =>
                  visit.labRequests?.some((request) =>
                    ["SENT_TO_DOCTOR", "RESULT_READY", "COMPLETED"].includes(request.status)
                  )
                )
              );
            })
          );
        }

        if (currentUser.role === "LAB_TECH") {
          tasks.push(apiRequest<LabBundle>("/center/lab").then(setLabData));
        }

        if (currentUser.role === "RECEPTIONIST") {
          tasks.push(apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow?status=WAITING_RECEPTION").then(setIntakeQueue));
          tasks.push(apiRequest<WorkflowVisitSummary[]>("/center/visit-workflow?status=WAITING_DOCTOR").then(setWaitingDoctorQueue));
        }

        await Promise.allSettled(tasks);

        if (!isActive) {
          return;
        }

        setDashboardData(payload);
      } catch (cause) {
        if (!isActive) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "تعذر تحميل لوحة المتابعة.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isActive = false;
    };
  }, [user]);

  if (loading) {
    return <div className="empty-state">جاري تحميل لوحة المتابعة...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  if (!dashboardData) {
    return <div className="empty-state">لا توجد بيانات متاحة لهذه الواجهة.</div>;
  }

  if ("stats" in dashboardData && !("center" in dashboardData)) {
    return (
      <div className="page-stack">
        <section className="hero-strip">
          <div>
            <p className="eyebrow">الإدارة المركزية</p>
            <h1>ملخص الشبكة</h1>
            <p className="muted">هذه الواجهة مخصصة للمركز المتوسط؛ افتح لوحة Central للتفاصيل المركزية الكاملة.</p>
          </div>
        </section>
      </div>
    );
  }

  const centerData = dashboardData as CenterWorkspaceData;

  if (user?.role === "DOCTOR") {
    return (
      <DoctorDashboard
        centerData={centerData}
        assignedReferrals={assignedReferrals}
        waitingVisits={waitingVisits}
        inTreatmentVisits={inTreatmentVisits}
        labReviewVisits={labReviewVisits}
        doctorName={user.fullName}
      />
    );
  }

  if (user?.role === "RECEPTIONIST") {
    return (
      <ReceptionDashboard
        centerData={centerData}
        intakeQueue={intakeQueue}
        waitingDoctor={waitingDoctorQueue}
        todayVisits={centerData.recentVisits.filter((visit) => isToday(visit.visitDate))}
      />
    );
  }

  if (user?.role === "LAB_TECH") {
    return <LabDashboard labData={labData} />;
  }

  return <ManagerDashboard centerData={centerData} />;
}
