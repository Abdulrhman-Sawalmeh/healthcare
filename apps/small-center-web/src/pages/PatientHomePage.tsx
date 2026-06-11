import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { PatientContactBar } from "../components/PatientContactBar";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PortalSummary } from "../types";

export function PatientHomePage() {
  const [summary, setSummary] = useState<PortalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<PortalSummary>("/portal/summary")
      .then(setSummary)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="screen-center">جارٍ تحميل ملف الرعاية الصحية...</div>;
  }

  if (!summary) {
    return <div className="empty-state">تعذر تحميل ملخص الرعاية الصحية.</div>;
  }

  const hasActiveSubscription = summary.stats.activeSubscriptions > 0;

  return (
    <div className="page-stack">
      <PatientContactBar centerName={summary.patient.center.name} phone={summary.patient.center.phone} />

      <section className="hero-strip">
        <div>
          <p className="eyebrow">ملف المريض</p>
          <h1>{summary.patient.fullName}</h1>
          <p className="muted">
            {joinMeta([
              summary.patient.medicalRecordNumber,
              summary.patient.center.name,
              summary.patient.insuranceNumber ?? "تأمين غير مسجل"
            ])}
          </p>
        </div>
        <div className="chip-row">
          <Link className="primary-button" to="/appointments">
            حجز موعد جديد
          </Link>
          <Link className="ghost-button" to="/medical-record">
            فتح السجل الصحي
          </Link>
          <Link className={hasActiveSubscription ? "ghost-button" : "primary-button"} to="/medical-record">
            {hasActiveSubscription ? "إدارة الاشتراك" : "تفعيل الاشتراك"}
          </Link>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Patient subscription</p>
            <h3>{hasActiveSubscription ? "Follow-up support is active" : "Add follow-up support"}</h3>
          </div>
          <Link className="ghost-button" to="/medical-record">
            {hasActiveSubscription ? "عرض الفواتير" : "دفع آمن"}
          </Link>
        </div>
        <div className="tile-stats">
          <span>Appointment reminders</span>
          <span>Medication reminders</span>
          <span>Contact your doctor</span>
        </div>
        <p className="muted">
          Non-subscribers can still view health history and prescriptions. The subscription adds
          follow-up reminders and secure doctor messaging.
        </p>
      </section>

      <section className="metric-grid">
        <Link className="metric-card interactive-card" to="/appointments">
          <span className="eyebrow">المواعيد القادمة</span>
          <h3>{summary.stats.upcomingAppointments}</h3>
          <p className="muted">مواعيد مؤكدة أو مجدولة في الفترة القادمة.</p>
          <p className="action-hint">اضغط لفتح صفحة المواعيد.</p>
        </Link>
        <Link className="metric-card interactive-card" to="/medical-record">
          <span className="eyebrow">التقارير السريرية</span>
          <h3>{summary.stats.completedReports}</h3>
          <p className="muted">زيارات مكتملة يمكن الرجوع إلى ملخصها الطبي.</p>
          <p className="action-hint">اضغط لفتح السجل الصحي.</p>
        </Link>
        <Link className="metric-card interactive-card" to="/medical-record">
          <span className="eyebrow">الإحالات النشطة</span>
          <h3>{summary.stats.activeReferrals}</h3>
          <p className="muted">إحالات ما زالت قيد المتابعة أو التنفيذ.</p>
          <p className="action-hint">اضغط لعرض الإحالات داخل السجل.</p>
        </Link>
        <Link className="metric-card interactive-card" to="/notifications">
          <span className="eyebrow">الإشعارات غير المقروءة</span>
          <h3>{summary.stats.unreadNotifications}</h3>
          <p className="muted">تنبيهات جديدة تخص المواعيد والتقارير والمحادثات.</p>
          <p className="action-hint">اضغط لفتح الإشعارات.</p>
        </Link>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">الموعد القادم</p>
              <h3>الخطة القادمة</h3>
            </div>
            <Link className="ghost-button" to="/appointments">
              إدارة المواعيد
            </Link>
          </div>
          {summary.nextAppointment ? (
            <Link className="stack-item interactive-card" to="/appointments">
              <strong>{summary.nextAppointment.doctor.fullName}</strong>
              <p>{summary.nextAppointment.reason}</p>
              <div className="tile-stats">
                <span>{formatDateTime(summary.nextAppointment.scheduledAt)}</span>
                <span>{toArabicLabel(summary.nextAppointment.type)}</span>
                <span>{summary.nextAppointment.department.name}</span>
              </div>
              <p className="action-hint">اضغط لفتح صفحة المواعيد.</p>
            </Link>
          ) : (
            <div className="empty-state compact">لا يوجد موعد قادم حتى الآن.</div>
          )}
        </article>

        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">آخر التقارير</p>
              <h3>ملخصات الزيارات</h3>
            </div>
            <Link className="ghost-button" to="/medical-record">
              عرض السجل الصحي
            </Link>
          </div>
          <div className="stack-list compact">
            {summary.recentReports.map((report) => (
              <Link className="stack-item interactive-card" key={report.id} to="/medical-record">
                <strong>{report.reason}</strong>
                <p>{report.notes ?? "تم توثيق الزيارة ضمن السجل الصحي."}</p>
                <div className="tile-stats">
                  <span>{report.doctor.fullName}</span>
                  <span>{formatDate(report.scheduledAt)}</span>
                  <span>{toArabicLabel(report.status)}</span>
                </div>
                <p className="action-hint">اضغط لعرض التقرير داخل السجل الصحي.</p>
              </Link>
            ))}
            {summary.recentReports.length === 0 ? (
              <div className="empty-state compact">لا توجد تقارير سريرية مكتملة بعد.</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">الفريق العلاجي</p>
              <h3>أطباء المركز</h3>
            </div>
            <Link className="ghost-button" to="/doctors">
              قائمة الأطباء
            </Link>
          </div>
          <div className="stack-list compact">
            {summary.careTeam.map((doctor) => (
              <Link className="stack-item interactive-card" key={doctor.id} to="/doctors">
                <strong>{doctor.fullName}</strong>
                <p>{doctor.specialization}</p>
                <div className="tile-stats">
                  <span>{doctor.department.name}</span>
                  <span>{doctor.yearsExperience} سنوات خبرة</span>
                </div>
                <p className="action-hint">اضغط لفتح قائمة الأطباء.</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">المحادثات الحديثة</p>
              <h3>آخر التحديثات من الطبيب</h3>
            </div>
            <Link className="ghost-button" to="/messages">
              {hasActiveSubscription ? "فتح المحادثات" : "Activate to contact doctor"}
            </Link>
          </div>
          <div className="stack-list compact">
            {summary.recentThreads.map((thread) => {
              const latestMessage = thread.messages[thread.messages.length - 1];

              return (
                <Link className="stack-item interactive-card" key={thread.id} to="/messages">
                  <strong>{thread.doctor.fullName}</strong>
                  <p>{latestMessage?.content ?? "لا توجد رسائل في هذه المحادثة."}</p>
                  <div className="tile-stats">
                    <span>{thread.doctor.departmentName}</span>
                    <span>{latestMessage ? formatDateTime(latestMessage.createdAt) : "-"}</span>
                  </div>
                  <p className="action-hint">اضغط لفتح المحادثات الطبية.</p>
                </Link>
              );
            })}
            {summary.recentThreads.length === 0 ? (
              <div className="empty-state compact">لا توجد محادثات مفتوحة حاليًا.</div>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
