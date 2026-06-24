import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { PatientContactBar } from "../components/PatientContactBar";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PortalSummary } from "../types";

const quickActions = [
  { to: "/appointments", title: "حجز موعد", helper: "اختر الطبيب والوقت المتاح." },
  { to: "/medical-record", title: "السجل الصحي", helper: "اطلع على الزيارات والتقارير." },
  { to: "/medical-record#reports", title: "التقارير الطبية", helper: "نتائج وتقارير قابلة للمراجعة." },
  { to: "/messages", title: "المحادثة الطبية", helper: "تابع رسائلك مع الطبيب." },
  { to: "/notifications", title: "الإشعارات", helper: "تنبيهات المواعيد والتقارير." },
  { to: "/doctors", title: "الأطباء", helper: "ابحث حسب التخصص والتوفر." }
];

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

  const recentUnreadThreads = useMemo(
    () =>
      summary?.recentThreads.filter((thread) =>
        thread.messages.some((message) => !message.isRead && message.sender.role !== "PATIENT")
      ).length ?? 0,
    [summary?.recentThreads]
  );

  if (loading) {
    return <div className="screen-center">جاري تحميل ملف الرعاية الصحية...</div>;
  }

  if (!summary) {
    return <div className="empty-state">تعذر تحميل ملخص الرعاية الصحية.</div>;
  }

  return (
    <div className="page-stack patient-home-page">
      <PatientContactBar centerName={summary.patient.center.name} phone={summary.patient.center.phone} />

      <section className="hero-strip">
        <div>
          <p className="eyebrow">بوابة المريض</p>
          <h1>{summary.patient.fullName}</h1>
          <p className="muted">
            {joinMeta([
              summary.patient.medicalRecordNumber,
              summary.patient.center.name,
              summary.patient.phone
            ])}
          </p>
        </div>
        <div className="button-row hero-actions">
          <Link className="primary-button" to="/appointments">حجز موعد جديد</Link>
          <Link className="ghost-button" to="/medical-record">فتح السجل الصحي</Link>
        </div>
      </section>

      <section className="metric-grid compact-metrics">
        <Link className="metric-card interactive-card" to="/appointments">
          <span className="eyebrow">المواعيد القادمة</span>
          <h3>{summary.stats.upcomingAppointments}</h3>
          <p className="muted">مواعيد مؤكدة أو مجدولة للفترة القادمة.</p>
          <p className="action-hint">فتح المواعيد</p>
        </Link>
        <Link className="metric-card interactive-card" to="/medical-record">
          <span className="eyebrow">التقارير الطبية</span>
          <h3>{summary.stats.completedReports}</h3>
          <p className="muted">تقارير وملخصات زيارات جاهزة للعرض.</p>
          <p className="action-hint">فتح السجل الصحي</p>
        </Link>
        <Link className="metric-card interactive-card" to="/medical-record">
          <span className="eyebrow">الإحالات النشطة</span>
          <h3>{summary.stats.activeReferrals}</h3>
          <p className="muted">إحالات قيد المتابعة أو التنفيذ.</p>
          <p className="action-hint">عرض الإحالات</p>
        </Link>
        <Link className="metric-card interactive-card" to="/notifications">
          <span className="eyebrow">إشعارات غير مقروءة</span>
          <h3>{summary.stats.unreadNotifications}</h3>
          <p className="muted">تنبيهات المواعيد، التقارير، والرسائل.</p>
          <p className="action-hint">فتح الإشعارات</p>
        </Link>
      </section>

      <section className="section-card quick-action-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">اختصارات</p>
            <h3>ما الذي تريد فعله الآن؟</h3>
          </div>
        </div>
        <div className="card-grid compact-action-grid">
          {quickActions.map((action) => (
            <Link className="profile-tile interactive-card" key={action.to} to={action.to}>
              <strong>{action.title}</strong>
              <p className="muted">{action.helper}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">الموعد القادم</p>
              <h3>الخطة القادمة</h3>
            </div>
            <Link className="ghost-button" to="/appointments">إدارة المواعيد</Link>
          </div>
          {summary.nextAppointment ? (
            <Link className="stack-item interactive-card" to={`/appointments?appointmentId=${summary.nextAppointment.id}`}>
              <strong>{summary.nextAppointment.doctor.fullName}</strong>
              <p>{summary.nextAppointment.reason}</p>
              <div className="tile-stats">
                <span>{formatDateTime(summary.nextAppointment.scheduledAt)}</span>
                <span>{toArabicLabel(summary.nextAppointment.type)}</span>
                <span>{summary.nextAppointment.department.name}</span>
              </div>
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
            <Link className="ghost-button" to="/medical-record#reports">عرض التقارير</Link>
          </div>
          <div className="stack-list compact">
            {summary.recentReports.slice(0, 4).map((report) => (
              <Link className="stack-item interactive-card" key={report.id} to="/medical-record#reports">
                <strong>{report.reason}</strong>
                <p>{report.notes ?? "تم توثيق الزيارة ضمن السجل الصحي."}</p>
                <div className="tile-stats">
                  <span>{report.doctor.fullName}</span>
                  <span>{formatDate(report.scheduledAt)}</span>
                  <span>{toArabicLabel(report.status)}</span>
                </div>
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
            <Link className="ghost-button" to="/doctors">قائمة الأطباء</Link>
          </div>
          <div className="stack-list compact">
            {summary.careTeam.slice(0, 5).map((doctor) => (
              <Link className="stack-item interactive-card" key={doctor.id} to={`/appointments?doctorId=${doctor.id}`}>
                <strong>{doctor.fullName}</strong>
                <p>{doctor.specialization}</p>
                <div className="tile-stats">
                  <span>{doctor.department.name}</span>
                  <span>{doctor.yearsExperience} سنوات خبرة</span>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">المحادثات الطبية</p>
              <h3>تحديثات الطبيب</h3>
            </div>
            <Link className="ghost-button" to="/messages">فتح المحادثات</Link>
          </div>
          <div className="inline-note">رسائل غير مقروءة من الفريق الطبي: {recentUnreadThreads}</div>
          <div className="stack-list compact">
            {summary.recentThreads.slice(0, 4).map((thread) => {
              const latestMessage = thread.messages[thread.messages.length - 1];

              return (
                <Link className="stack-item interactive-card" key={thread.id} to="/messages">
                  <strong>{thread.doctor.fullName}</strong>
                  <p>{latestMessage?.content ?? "لا توجد رسائل في هذه المحادثة."}</p>
                  <div className="tile-stats">
                    <span>{thread.doctor.departmentName}</span>
                    <span>{latestMessage ? formatDateTime(latestMessage.createdAt) : "-"}</span>
                  </div>
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
