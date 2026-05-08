import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PortalAppointmentRecord, PortalMedicalRecord } from "../types";

type ActivePanel =
  | { kind: "profile" }
  | { kind: "conditions" }
  | { kind: "appointments" }
  | { kind: "report"; id: string }
  | { kind: "referral"; id: string }
  | { kind: "subscription"; id: string }
  | null;

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAmount(amountInCents: number, currency: string) {
  return `${(amountInCents / 100).toFixed(2)} ${currency}`;
}

function openPrintableReport(record: PortalMedicalRecord, report: PortalAppointmentRecord) {
  const reportWindow = window.open("", "_blank", "width=980,height=720");

  if (!reportWindow) {
    return;
  }

  const title = `تقرير-${record.patient.fullName}-${report.id}`;
  const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          :root {
            color-scheme: light;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
            background: #f5f1ea;
            color: #17322d;
            line-height: 1.8;
          }

          main {
            max-width: 900px;
            margin: 0 auto;
            padding: 32px 24px 40px;
          }

          header,
          section {
            background: #fffdf9;
            border: 1px solid rgba(23, 50, 45, 0.1);
            border-radius: 22px;
            padding: 24px;
            margin-bottom: 18px;
          }

          h1,
          h2,
          h3,
          p {
            margin: 0;
          }

          h1 {
            font-size: 30px;
            margin-top: 10px;
          }

          h2 {
            font-size: 18px;
            margin-bottom: 14px;
          }

          .eyebrow {
            color: #0f7663;
            font-size: 13px;
            font-weight: 700;
          }

          .muted {
            color: #607773;
          }

          .lead {
            margin-top: 14px;
            font-size: 16px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .field {
            padding: 14px 16px;
            border-radius: 16px;
            background: #f7faf8;
            border: 1px solid rgba(23, 50, 45, 0.08);
          }

          .field span {
            display: block;
            color: #607773;
            font-size: 13px;
            margin-bottom: 4px;
          }

          .field strong {
            font-size: 16px;
          }

          .helper {
            margin-top: 12px;
            padding: 12px 14px;
            border-radius: 14px;
            background: rgba(15, 118, 99, 0.08);
            color: #0f7663;
          }

          @media print {
            body {
              background: white;
            }

            main {
              max-width: none;
              padding: 0;
            }

            header,
            section {
              border: 1px solid rgba(23, 50, 45, 0.08);
              box-shadow: none;
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <header>
            <p class="eyebrow">السجل الصحي والتقرير الطبي</p>
            <h1>${escapeHtml(report.reason)}</h1>
            <p class="muted">${escapeHtml(
              joinMeta([
                record.patient.fullName,
                record.patient.medicalRecordNumber,
                formatDateTime(report.scheduledAt)
              ])
            )}</p>
            <p class="lead">${escapeHtml(report.notes ?? "تم توثيق الزيارة داخل السجل الصحي دون ملاحظات إضافية.")}</p>
          </header>

          <section>
            <h2>بيانات المريض</h2>
            <div class="grid">
              <div class="field">
                <span>اسم المريض</span>
                <strong>${escapeHtml(record.patient.fullName)}</strong>
              </div>
              <div class="field">
                <span>رقم الملف الطبي</span>
                <strong>${escapeHtml(record.patient.medicalRecordNumber)}</strong>
              </div>
              <div class="field">
                <span>تاريخ الميلاد</span>
                <strong>${escapeHtml(formatDate(record.profile.dateOfBirth))}</strong>
              </div>
              <div class="field">
                <span>الجنس</span>
                <strong>${escapeHtml(toArabicLabel(record.profile.gender))}</strong>
              </div>
            </div>
          </section>

          <section>
            <h2>تفاصيل الزيارة</h2>
            <div class="grid">
              <div class="field">
                <span>الطبيب</span>
                <strong>${escapeHtml(report.doctor.fullName)}</strong>
              </div>
              <div class="field">
                <span>التخصص</span>
                <strong>${escapeHtml(report.doctor.specialization)}</strong>
              </div>
              <div class="field">
                <span>القسم</span>
                <strong>${escapeHtml(report.department.name)}</strong>
              </div>
              <div class="field">
                <span>نوع الزيارة</span>
                <strong>${escapeHtml(toArabicLabel(report.type))}</strong>
              </div>
              <div class="field">
                <span>الحالة</span>
                <strong>${escapeHtml(toArabicLabel(report.status))}</strong>
              </div>
              <div class="field">
                <span>المركز</span>
                <strong>${escapeHtml(report.center.name)}</strong>
              </div>
            </div>
            <p class="helper">يمكنك اختيار Save as PDF من نافذة الطباعة للاحتفاظ بالتقرير كملف PDF.</p>
          </section>
        </main>

        <script>
          window.addEventListener("load", () => {
            window.setTimeout(() => window.print(), 250);
          });
        </script>
      </body>
    </html>
  `;

  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
}

export function PatientMedicalRecordPage() {
  const [record, setRecord] = useState<PortalMedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    apiRequest<PortalMedicalRecord>("/portal/medical-record")
      .then(setRecord)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!activePanel || !detailPanelRef.current) {
      return;
    }

    detailPanelRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, [activePanel]);

  const activeReport = useMemo(() => {
    if (!record || activePanel?.kind !== "report") {
      return null;
    }

    return record.clinicalReports.find((report) => report.id === activePanel.id) ?? null;
  }, [activePanel, record]);

  const activeReferral = useMemo(() => {
    if (!record || activePanel?.kind !== "referral") {
      return null;
    }

    return record.referrals.find((referral) => referral.id === activePanel.id) ?? null;
  }, [activePanel, record]);

  const activeSubscription = useMemo(() => {
    if (!record || activePanel?.kind !== "subscription") {
      return null;
    }

    return record.subscriptions.find((subscription) => subscription.id === activePanel.id) ?? null;
  }, [activePanel, record]);

  function openPanel(nextPanel: Exclude<ActivePanel, null>) {
    setActivePanel(nextPanel);
  }

  function handlePanelActivation(event: KeyboardEvent<HTMLElement>, nextPanel: Exclude<ActivePanel, null>) {
    if (!isActivationKey(event)) {
      return;
    }

    event.preventDefault();
    openPanel(nextPanel);
  }

  function renderDetailPanel() {
    if (!record || !activePanel) {
      return null;
    }

    if (activePanel.kind === "profile") {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">بيانات السجل</p>
              <h3>تفاصيل الملف الصحي الأساسية</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>
              إغلاق
            </button>
          </div>
          <div className="detail-grid">
            <div className="detail-field">
              <span>اسم المريض</span>
              <strong>{record.patient.fullName}</strong>
            </div>
            <div className="detail-field">
              <span>رقم الملف الطبي</span>
              <strong>{record.patient.medicalRecordNumber}</strong>
            </div>
            <div className="detail-field">
              <span>المركز الطبي</span>
              <strong>{record.profile.center.name}</strong>
            </div>
            <div className="detail-field">
              <span>رمز المركز</span>
              <strong>{record.profile.center.code}</strong>
            </div>
            <div className="detail-field">
              <span>المدينة</span>
              <strong>{record.profile.center.city}</strong>
            </div>
            <div className="detail-field">
              <span>العنوان</span>
              <strong>{record.profile.center.address}</strong>
            </div>
            <div className="detail-field">
              <span>رقم التأمين</span>
              <strong>{record.profile.insuranceNumber ?? "غير مسجل"}</strong>
            </div>
            <div className="detail-field">
              <span>جهة التواصل الطارئة</span>
              <strong>{record.profile.emergencyContact ?? "غير مسجلة"}</strong>
            </div>
          </div>
          <div className="chip-row">
            <Link className="primary-button" to="/appointments">
              إدارة المواعيد
            </Link>
            <Link className="ghost-button" to="/notifications">
              متابعة الإشعارات
            </Link>
          </div>
        </section>
      );
    }

    if (activePanel.kind === "conditions") {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">الحالة الصحية</p>
              <h3>الأمراض المزمنة ومعلومات المتابعة</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>
              إغلاق
            </button>
          </div>
          <div className="stack-item">
            <strong>{record.profile.chronicConditions ?? "لا توجد أمراض مزمنة موثقة حتى الآن."}</strong>
            <p>جهة التواصل الطارئة: {record.profile.emergencyContact ?? "غير مسجلة"}</p>
            <div className="tile-stats">
              <span>{toArabicLabel(record.profile.gender)}</span>
              <span>{formatDate(record.profile.dateOfBirth)}</span>
              <span>{record.profile.center.name}</span>
            </div>
          </div>
          <p className="inline-note">يمكنك الرجوع إلى الطبيب أو حجز متابعة جديدة إذا تغيرت الأعراض أو الخطة العلاجية.</p>
          <div className="chip-row">
            <Link className="primary-button" to="/appointments">
              حجز متابعة
            </Link>
            <Link className="ghost-button" to="/messages">
              مراسلة الطبيب
            </Link>
          </div>
        </section>
      );
    }

    if (activePanel.kind === "appointments") {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">المواعيد القادمة</p>
              <h3>كل المواعيد النشطة في السجل الصحي</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>
              إغلاق
            </button>
          </div>
          <div className="stack-list">
            {record.upcomingAppointments.map((appointment) => (
              <div className="stack-item" key={appointment.id}>
                <strong>{appointment.doctor.fullName}</strong>
                <p>{appointment.reason}</p>
                <div className="tile-stats">
                  <span>{formatDateTime(appointment.scheduledAt)}</span>
                  <span>{appointment.department.name}</span>
                  <span>{toArabicLabel(appointment.type)}</span>
                  <span>{toArabicLabel(appointment.status)}</span>
                </div>
              </div>
            ))}
            {record.upcomingAppointments.length === 0 ? (
              <div className="empty-state compact">لا توجد مواعيد قادمة مسجلة في الوقت الحالي.</div>
            ) : null}
          </div>
          <div className="chip-row">
            <Link className="primary-button" to="/appointments">
              فتح صفحة المواعيد
            </Link>
            <Link className="ghost-button" to="/doctors">
              عرض الأطباء
            </Link>
          </div>
        </section>
      );
    }

    if (activePanel.kind === "report" && activeReport) {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">التقرير الطبي</p>
              <h3>{activeReport.reason}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>
              إغلاق
            </button>
          </div>
          <div className="stack-item">
            <strong>{activeReport.doctor.fullName}</strong>
            <p>{activeReport.notes ?? "تم توثيق الزيارة ضمن السجل الصحي دون ملاحظات إضافية."}</p>
            <div className="tile-stats">
              <span>{formatDateTime(activeReport.scheduledAt)}</span>
              <span>{activeReport.department.name}</span>
              <span>{toArabicLabel(activeReport.type)}</span>
              <span>{toArabicLabel(activeReport.status)}</span>
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-field">
              <span>الطبيب</span>
              <strong>{activeReport.doctor.fullName}</strong>
            </div>
            <div className="detail-field">
              <span>التخصص</span>
              <strong>{activeReport.doctor.specialization}</strong>
            </div>
            <div className="detail-field">
              <span>القسم</span>
              <strong>{activeReport.department.name}</strong>
            </div>
            <div className="detail-field">
              <span>المركز</span>
              <strong>{activeReport.center.name}</strong>
            </div>
          </div>
          <p className="inline-note">زر الطباعة يفتح نسخة مناسبة للطباعة ويمكن حفظها من المتصفح كملف PDF.</p>
          <div className="chip-row">
            <button className="primary-button" type="button" onClick={() => openPrintableReport(record, activeReport)}>
              طباعة أو حفظ PDF
            </button>
            <Link className="ghost-button" to="/messages">
              مراسلة الطبيب
            </Link>
            <Link className="ghost-button" to="/appointments">
              حجز متابعة
            </Link>
          </div>
        </section>
      );
    }

    if (activePanel.kind === "referral" && activeReferral) {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">تفاصيل الإحالة</p>
              <h3>{activeReferral.reason}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>
              إغلاق
            </button>
          </div>
          <div className="stack-item">
            <strong>
              {activeReferral.fromCenter.name} ← {activeReferral.toCenter.name}
            </strong>
            <p>{activeReferral.notes ?? "لا توجد ملاحظات إضافية على الإحالة."}</p>
            <div className="tile-stats">
              <span>{toArabicLabel(activeReferral.status)}</span>
              <span>{toArabicLabel(activeReferral.priority)}</span>
              <span>{formatDate(activeReferral.createdAt)}</span>
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-field">
              <span>الطبيب المحيل</span>
              <strong>{activeReferral.fromDoctor.fullName}</strong>
            </div>
            <div className="detail-field">
              <span>الطبيب المستلم</span>
              <strong>{activeReferral.toDoctor?.fullName ?? "لم يتم التحديد بعد"}</strong>
            </div>
            <div className="detail-field">
              <span>القسم</span>
              <strong>{activeReferral.department?.name ?? "غير محدد"}</strong>
            </div>
            <div className="detail-field">
              <span>تاريخ القبول</span>
              <strong>{activeReferral.acceptedAt ? formatDate(activeReferral.acceptedAt) : "بانتظار القبول"}</strong>
            </div>
          </div>
          <div className="chip-row">
            <Link className="primary-button" to="/messages">
              متابعة مع الطبيب
            </Link>
            <Link className="ghost-button" to="/notifications">
              فتح الإشعارات
            </Link>
          </div>
        </section>
      );
    }

    if (activePanel.kind === "subscription" && activeSubscription) {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">تفاصيل الاشتراك</p>
              <h3>{activeSubscription.plan.name}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>
              إغلاق
            </button>
          </div>
          <div className="stack-item">
            <strong>{activeSubscription.plan.description ?? "خطة متابعة علاجية مرتبطة بالحساب الحالي."}</strong>
            <div className="tile-stats">
              <span>{toArabicLabel(activeSubscription.status)}</span>
              <span>{toArabicLabel(activeSubscription.plan.billingCycle)}</span>
              <span>{formatAmount(activeSubscription.plan.priceInCents, "ILS")}</span>
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-field">
              <span>المركز</span>
              <strong>{activeSubscription.center.name}</strong>
            </div>
            <div className="detail-field">
              <span>أقصى عدد زيارات</span>
              <strong>{activeSubscription.plan.maxVisits}</strong>
            </div>
            <div className="detail-field">
              <span>تاريخ البداية</span>
              <strong>{formatDate(activeSubscription.startedAt)}</strong>
            </div>
            <div className="detail-field">
              <span>تاريخ النهاية</span>
              <strong>{formatDate(activeSubscription.endsAt)}</strong>
            </div>
            <div className="detail-field">
              <span>التجديد التلقائي</span>
              <strong>{activeSubscription.autoRenew ? "مفعل" : "غير مفعل"}</strong>
            </div>
          </div>
          <div className="stack-list compact">
            {activeSubscription.payments.map((payment) => (
              <div className="stack-item" key={payment.id}>
                <strong>{formatAmount(payment.amountInCents, payment.currency)}</strong>
                <p>{toArabicLabel(payment.status)}</p>
                <div className="tile-stats">
                  <span>{toArabicLabel(payment.method)}</span>
                  <span>{formatDate(payment.paidAt ?? payment.createdAt)}</span>
                  <span>{payment.reference ?? "بدون مرجع"}</span>
                </div>
              </div>
            ))}
            {activeSubscription.payments.length === 0 ? (
              <div className="empty-state compact">لا توجد دفعات مسجلة لهذا الاشتراك بعد.</div>
            ) : null}
          </div>
        </section>
      );
    }

    return null;
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل السجل الصحي...</div>;
  }

  if (!record) {
    return <div className="empty-state">تعذر تحميل السجل الصحي.</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">السجل الصحي والتقارير الطبية</p>
          <h1>{record.patient.fullName}</h1>
          <p className="muted">
            {joinMeta([
              record.patient.medicalRecordNumber,
              toArabicLabel(record.profile.gender),
              formatDate(record.profile.dateOfBirth)
            ])}
          </p>
        </div>
        <div className="chip-row">
          <Link className="primary-button" to="/appointments">
            إدارة المواعيد
          </Link>
          <Link className="ghost-button" to="/messages">
            مراسلة الفريق الطبي
          </Link>
        </div>
      </section>

      <section className="card-grid">
        <article
          className="profile-tile interactive-card"
          role="button"
          tabIndex={0}
          onClick={() => openPanel({ kind: "profile" })}
          onKeyDown={(event) => handlePanelActivation(event, { kind: "profile" })}
        >
          <p className="eyebrow">البيانات الأساسية</p>
          <h3>{record.profile.center.name}</h3>
          <p>{record.profile.center.city}</p>
          <div className="tile-stats">
            <span>{record.profile.center.code}</span>
            <span>{record.profile.insuranceNumber ?? "لا يوجد رقم تأمين"}</span>
          </div>
          <p className="action-hint">اضغط لعرض التفاصيل الكاملة للملف.</p>
        </article>

        <article
          className="profile-tile interactive-card"
          role="button"
          tabIndex={0}
          onClick={() => openPanel({ kind: "conditions" })}
          onKeyDown={(event) => handlePanelActivation(event, { kind: "conditions" })}
        >
          <p className="eyebrow">الأمراض المزمنة</p>
          <h3>{record.profile.chronicConditions ?? "لا توجد أمراض مزمنة موثقة"}</h3>
          <p>جهة الاتصال الطارئة: {record.profile.emergencyContact ?? "غير مسجلة"}</p>
          <p className="action-hint">اضغط لعرض الحالة الصحية ومعلومات المتابعة.</p>
        </article>

        <article
          className="profile-tile interactive-card"
          role="button"
          tabIndex={0}
          onClick={() => openPanel({ kind: "appointments" })}
          onKeyDown={(event) => handlePanelActivation(event, { kind: "appointments" })}
        >
          <p className="eyebrow">المواعيد القادمة</p>
          <h3>{record.upcomingAppointments.length}</h3>
          <p>مواعيد نشطة داخل الخطة العلاجية الحالية.</p>
          <p className="action-hint">اضغط لعرض جميع المواعيد القادمة.</p>
        </article>
      </section>

      {renderDetailPanel()}

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">التقارير السريرية</p>
              <h3>ملخصات الزيارات المكتملة</h3>
            </div>
          </div>
          <div className="stack-list">
            {record.clinicalReports.map((report) => (
              <article
                className="stack-item interactive-card"
                key={report.id}
                role="button"
                tabIndex={0}
                onClick={() => openPanel({ kind: "report", id: report.id })}
                onKeyDown={(event) => handlePanelActivation(event, { kind: "report", id: report.id })}
              >
                <strong>{report.reason}</strong>
                <p>{report.notes ?? "لا توجد ملاحظات سريرية إضافية."}</p>
                <div className="tile-stats">
                  <span>{report.doctor.fullName}</span>
                  <span>{report.department.name}</span>
                  <span>{formatDateTime(report.scheduledAt)}</span>
                </div>
                <p className="action-hint">اضغط لفتح التقرير وطباعة نسخة PDF.</p>
              </article>
            ))}
            {record.clinicalReports.length === 0 ? (
              <div className="empty-state compact">لا توجد تقارير مكتملة حتى الآن.</div>
            ) : null}
          </div>
        </article>

        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">الإحالات</p>
              <h3>الحالة الحالية للإحالات</h3>
            </div>
          </div>
          <div className="stack-list compact">
            {record.referrals.map((referral) => (
              <article
                className="stack-item interactive-card"
                key={referral.id}
                role="button"
                tabIndex={0}
                onClick={() => openPanel({ kind: "referral", id: referral.id })}
                onKeyDown={(event) => handlePanelActivation(event, { kind: "referral", id: referral.id })}
              >
                <strong>{referral.reason}</strong>
                <p>
                  {referral.fromCenter.name} ← {referral.toCenter.name}
                </p>
                <div className="tile-stats">
                  <span>{toArabicLabel(referral.status)}</span>
                  <span>{referral.toDoctor?.fullName ?? "لم يحدد الطبيب بعد"}</span>
                  <span>{formatDate(referral.createdAt)}</span>
                </div>
                <p className="action-hint">اضغط لعرض تفاصيل الإحالة الحالية.</p>
              </article>
            ))}
            {record.referrals.length === 0 ? (
              <div className="empty-state compact">لا توجد إحالات مسجلة حاليًا.</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">خطط المتابعة</p>
            <h3>الاشتراكات والفواتير</h3>
          </div>
        </div>
        <div className="stack-list compact">
          {record.subscriptions.map((subscription) => (
            <article
              className="stack-item interactive-card"
              key={subscription.id}
              role="button"
              tabIndex={0}
              onClick={() => openPanel({ kind: "subscription", id: subscription.id })}
              onKeyDown={(event) => handlePanelActivation(event, { kind: "subscription", id: subscription.id })}
            >
              <strong>{subscription.plan.name}</strong>
              <p>{subscription.plan.description ?? "خطة متابعة علاجية بدون وصف إضافي."}</p>
              <div className="tile-stats">
                <span>{toArabicLabel(subscription.status)}</span>
                <span>{toArabicLabel(subscription.plan.billingCycle)}</span>
                <span>{formatAmount(subscription.plan.priceInCents, "ILS")}</span>
              </div>
              {subscription.payments[0] ? (
                <p className="muted">
                  آخر دفعة: {formatAmount(subscription.payments[0].amountInCents, subscription.payments[0].currency)} في{" "}
                  {formatDate(subscription.payments[0].paidAt ?? subscription.payments[0].createdAt)}
                </p>
              ) : null}
              <p className="action-hint">اضغط لعرض تفاصيل الاشتراك والدفعات.</p>
            </article>
          ))}
          {record.subscriptions.length === 0 ? (
            <div className="empty-state compact">لا توجد اشتراكات علاجية مرتبطة بالحساب.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
