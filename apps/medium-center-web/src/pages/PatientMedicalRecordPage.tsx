import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiRequest } from "../api/client";
import { PatientContactBar } from "../components/PatientContactBar";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PortalClinicalReportRecord, PortalMedicalRecord } from "../types";

type ActivePanel =
  | { kind: "profile" }
  | { kind: "report"; id: string }
  | { kind: "referral"; id: string }
  | null;

function isActivationKey(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" || event.key === " ";
}

function uniqueReports(reports: PortalClinicalReportRecord[]) {
  const byKey = new Map<string, PortalClinicalReportRecord>();

  for (const report of reports) {
    const key = [report.source, report.id, report.reason, report.scheduledAt].join(":");
    if (!byKey.has(key)) {
      byKey.set(key, report);
    }
  }

  return [...byKey.values()].sort(
    (left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime()
  );
}

function normalizeReportHighlight(value: string | null) {
  if (!value) return null;
  if (value.startsWith("local-report-")) return value;
  if (value.startsWith("lab-report-")) return `local-report-${value.replace("lab-report-", "")}`;
  return null;
}

const reportPageSizeOptions = [10, 25, 50, 100];

function getReportRequestedAt(report: PortalClinicalReportRecord) {
  return report.labRequest?.requestedAt ?? report.scheduledAt;
}

function getReportServiceDescription(report: PortalClinicalReportRecord) {
  return report.labRequest?.testName ?? report.reason;
}

function getReportUrl(report: PortalClinicalReportRecord) {
  return report.reportUrl ?? report.labRequest?.reportUrl ?? null;
}

function getReportAttachmentHref(report: PortalClinicalReportRecord) {
  if (!report.attachment?.contentBase64) {
    return null;
  }

  return `data:${report.attachment.mimeType};base64,${report.attachment.contentBase64}`;
}

export function PatientMedicalRecordPage() {
  const location = useLocation();
  const [record, setRecord] = useState<PortalMedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportPageSize, setReportPageSize] = useState(10);
  const [reportPage, setReportPage] = useState(1);
  const [refillMessage, setRefillMessage] = useState("");
  const [refillError, setRefillError] = useState("");
  const [refillBusyId, setRefillBusyId] = useState<number | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const reportResultsRef = useRef<HTMLElement | null>(null);

  async function loadRecord() {
    const payload = await apiRequest<PortalMedicalRecord>("/portal/medical-record");
    setRecord(payload);
  }

  useEffect(() => {
    loadRecord()
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!activePanel || !detailPanelRef.current) {
      return;
    }

    detailPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activePanel]);

  useEffect(() => {
    if (loading || location.hash !== "#reports" || !reportResultsRef.current) {
      return;
    }

    reportResultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  useEffect(() => {
    if (loading || !record) {
      return;
    }

    const reportId = normalizeReportHighlight(new URLSearchParams(location.search).get("highlight"));
    if (!reportId) {
      return;
    }

    const report = uniqueReports(record.clinicalReports).find((item) => item.id === reportId);
    if (!report) {
      return;
    }

    setActivePanel({ kind: "report", id: report.id });
    window.setTimeout(() => {
      reportResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [loading, location.search, record]);

  const filteredReports = useMemo(() => {
    if (!record) {
      return [];
    }

    const query = reportSearch.trim().toLowerCase();
    const fromTime = reportFromDate ? new Date(`${reportFromDate}T00:00:00`).getTime() : null;
    const toTime = reportToDate ? new Date(`${reportToDate}T23:59:59`).getTime() : null;

    return uniqueReports(record.clinicalReports).filter((report) => {
      const reportTime = new Date(getReportRequestedAt(report)).getTime();
      const labRequest = report.labRequest;
      const matchesQuery =
        !query ||
        report.reason.toLowerCase().includes(query) ||
        report.doctor.fullName.toLowerCase().includes(query) ||
        report.center.name.toLowerCase().includes(query) ||
        report.department.name.toLowerCase().includes(query) ||
        (labRequest?.testName ?? "").toLowerCase().includes(query) ||
        (labRequest?.resultValue ?? "").toLowerCase().includes(query) ||
        (report.summary ?? "").toLowerCase().includes(query);
      const matchesFrom = fromTime == null || reportTime >= fromTime;
      const matchesTo = toTime == null || reportTime <= toTime;

      return matchesQuery && matchesFrom && matchesTo;
    });
  }, [record, reportFromDate, reportSearch, reportToDate]);

  const reportPageCount = Math.max(1, Math.ceil(filteredReports.length / reportPageSize));
  const currentReportPage = Math.min(reportPage, reportPageCount);

  const paginatedReports = useMemo(() => {
    const start = (currentReportPage - 1) * reportPageSize;
    return filteredReports.slice(start, start + reportPageSize);
  }, [currentReportPage, filteredReports, reportPageSize]);

  const reportRangeStart = filteredReports.length === 0 ? 0 : (currentReportPage - 1) * reportPageSize + 1;
  const reportRangeEnd = filteredReports.length === 0 ? 0 : reportRangeStart + paginatedReports.length - 1;

  useEffect(() => {
    setReportPage(1);
  }, [reportFromDate, reportPageSize, reportSearch, reportToDate]);

  useEffect(() => {
    if (reportPage > reportPageCount) {
      setReportPage(reportPageCount);
    }
  }, [reportPage, reportPageCount]);

  const activeReport = useMemo(() => {
    if (!record || activePanel?.kind !== "report") {
      return null;
    }

    return uniqueReports(record.clinicalReports).find((report) => report.id === activePanel.id) ?? null;
  }, [activePanel, record]);

  const activeReferral = useMemo(() => {
    if (!record || activePanel?.kind !== "referral") {
      return null;
    }

    return record.referrals.find((referral) => referral.id === activePanel.id) ?? null;
  }, [activePanel, record]);

  const highlightedReportId = normalizeReportHighlight(new URLSearchParams(location.search).get("highlight"));

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

  async function handleRequestRefill(prescriptionId: number) {
    setRefillBusyId(prescriptionId);
    setRefillError("");
    setRefillMessage("");

    try {
      await apiRequest("/portal/refill-requests", {
        method: "POST",
        body: JSON.stringify({ prescriptionId })
      });
      setRefillMessage("تم إرسال طلب تجديد الدواء إلى الطبيب.");
      await loadRecord();
    } catch (cause) {
      setRefillError(cause instanceof Error ? cause.message : "تعذر إرسال طلب تجديد الدواء.");
    } finally {
      setRefillBusyId(null);
    }
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
              <p className="eyebrow">بيانات الملف</p>
              <h3>{record.patient.fullName}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>إغلاق</button>
          </div>
          <div className="detail-grid">
            <div className="detail-field"><span>رقم الملف</span><strong>{record.patient.medicalRecordNumber}</strong></div>
            <div className="detail-field"><span>تاريخ الميلاد</span><strong>{formatDate(record.profile.dateOfBirth)}</strong></div>
            <div className="detail-field"><span>الجنس</span><strong>{toArabicLabel(record.profile.gender)}</strong></div>
            <div className="detail-field"><span>الطوارئ</span><strong>{record.profile.emergencyContact ?? "غير مسجل"}</strong></div>
            <div className="detail-field"><span>الحالات المزمنة</span><strong>{record.patient.chronicConditions ?? "لا توجد بيانات مسجلة"}</strong></div>
            <div className="detail-field"><span>المركز</span><strong>{record.profile.center.name}</strong></div>
          </div>
        </section>
      );
    }

    if (activeReport) {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">تفاصيل التقرير</p>
              <h3>{activeReport.reason}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>إغلاق</button>
          </div>
          <div className="tile-stats">
            <span>{formatDateTime(activeReport.scheduledAt)}</span>
            <span>{activeReport.doctor.fullName}</span>
            <span>{activeReport.department.name}</span>
            <span>{toArabicLabel(activeReport.status)}</span>
          </div>
          <div className="detail-grid">
            <div className="detail-field field-span-2">
              <span>الملخص</span>
              <strong>{activeReport.summary ?? activeReport.notes ?? "لا يوجد ملخص إضافي."}</strong>
            </div>
            <div className="detail-field field-span-2">
              <span>النتائج</span>
              <strong>{activeReport.findings ?? "لا توجد نتائج مفصلة."}</strong>
            </div>
            <div className="detail-field field-span-2">
              <span>التوصيات</span>
              <strong>{activeReport.recommendations ?? activeReport.recommendedFollowUp ?? "لا توجد توصيات مسجلة."}</strong>
            </div>
          </div>
          {activeReport.reportUrl ? (
            <a className="ghost-button" href={activeReport.reportUrl} rel="noreferrer" target="_blank">
              فتح رابط التقرير
            </a>
          ) : null}
          {activeReport.attachment ? (
            <div className="inline-note">
              <strong>{activeReport.attachment.fileName}</strong>
              <p className="muted">{activeReport.attachment.mimeType}</p>
              {activeReport.attachment.contentBase64 ? (
                <a
                  className="ghost-button"
                  download={activeReport.attachment.fileName}
                  href={`data:${activeReport.attachment.mimeType};base64,${activeReport.attachment.contentBase64}`}
                >
                  تنزيل المرفق
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      );
    }

    if (activeReferral) {
      return (
        <section className="section-card detail-panel" ref={detailPanelRef}>
          <div className="section-header">
            <div>
              <p className="eyebrow">تفاصيل الإحالة</p>
              <h3>{activeReferral.reason}</h3>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActivePanel(null)}>إغلاق</button>
          </div>
          <div className="detail-grid">
            <div className="detail-field"><span>من</span><strong>{activeReferral.fromCenter.name}</strong></div>
            <div className="detail-field"><span>إلى</span><strong>{activeReferral.toCenter.name}</strong></div>
            <div className="detail-field"><span>الطبيب المحيل</span><strong>{activeReferral.fromDoctor.fullName}</strong></div>
            <div className="detail-field"><span>الطبيب المستقبل</span><strong>{activeReferral.toDoctor?.fullName ?? "لم يتم التحديد بعد"}</strong></div>
            <div className="detail-field"><span>القسم</span><strong>{activeReferral.department?.name ?? "غير محدد"}</strong></div>
            <div className="detail-field"><span>الحالة</span><StatusBadge status={activeReferral.status} /></div>
          </div>
          {activeReferral.notes ? <p className="inline-note">{activeReferral.notes}</p> : null}
        </section>
      );
    }

    return null;
  }

  if (loading) {
    return <div className="screen-center">جاري تحميل السجل الصحي...</div>;
  }

  if (!record) {
    return <div className="empty-state">تعذر تحميل السجل الصحي.</div>;
  }

  return (
    <div className="page-stack patient-medical-record-page">
      <PatientContactBar centerName={record.profile.center.name} phone={record.profile.center.phone} />

      <section className="hero-strip">
        <div>
          <p className="eyebrow">السجل الصحي والتقارير الطبية</p>
          <h1>{record.patient.fullName}</h1>
          <p className="muted">
            {joinMeta([record.patient.medicalRecordNumber, toArabicLabel(record.profile.gender), formatDate(record.profile.dateOfBirth)])}
          </p>
        </div>
        <div className="chip-row">
          <Link className="primary-button" to="/appointments">إدارة المواعيد</Link>
          <Link className="ghost-button" to="/messages">مراسلة الفريق الطبي</Link>
          <button className="ghost-button" type="button" onClick={() => openPanel({ kind: "profile" })}>بيانات الملف</button>
        </div>
      </section>

      <section className="metric-grid compact-metrics">
        <article className="metric-card"><span className="eyebrow">التقارير</span><h3>{filteredReports.length}</h3><p className="muted">تقارير ونتائج قابلة للمراجعة.</p></article>
        <article className="metric-card"><span className="eyebrow">المواعيد القادمة</span><h3>{record.upcomingAppointments.length}</h3><p className="muted">زيارات مجدولة أو مؤكدة.</p></article>
        <article className="metric-card"><span className="eyebrow">الإحالات</span><h3>{record.referrals.length}</h3><p className="muted">طلبات إحالة مرتبطة بسجلك.</p></article>
        <article className="metric-card"><span className="eyebrow">تذكيرات المتابعة</span><h3>{record.followUpReminders?.length ?? 0}</h3><p className="muted">متابعات علاجية قادمة.</p></article>
      </section>

      {renderDetailPanel()}

      <section className="section-card" id="reports" ref={reportResultsRef}>
        <div className="section-header">
          <div>
            <p className="eyebrow">التقارير الطبية</p>
            <h3>نتائج وملخصات الزيارات</h3>
          </div>
        </div>
        <div className="medical-report-date-filter">
          <label className="field">
            <span>من تاريخ*</span>
            <input type="date" value={reportFromDate} onChange={(event) => setReportFromDate(event.target.value)} />
          </label>
          <label className="field">
            <span>إلى تاريخ*</span>
            <input type="date" value={reportToDate} onChange={(event) => setReportToDate(event.target.value)} />
          </label>
          <button className="primary-button" type="button" onClick={() => setReportPage(1)}>ابحث</button>
        </div>
        <div className="form-grid compact-form-grid legacy-report-filters" aria-hidden="true">
          <label className="field"><span>بحث</span><input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="الطبيب، القسم، سبب الزيارة..." /></label>
          <label className="field"><span>من تاريخ</span><input type="date" value={reportFromDate} onChange={(event) => setReportFromDate(event.target.value)} /></label>
          <label className="field"><span>إلى تاريخ</span><input type="date" value={reportToDate} onChange={(event) => setReportToDate(event.target.value)} /></label>
        </div>
        <div className="medical-reports-table-card">
          <div className="medical-reports-table-toolbar">
            <label className="entries-control">
              <span>أظهر</span>
              <select
                value={reportPageSize}
                onChange={(event) => setReportPageSize(Number(event.target.value))}
              >
                {reportPageSizeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span>مدخلات</span>
            </label>
            <label className="medical-report-search">
              <span>ابحث:</span>
              <input
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                placeholder="مثال بحث"
              />
            </label>
          </div>

          <div className="table-wrapper medical-reports-table-wrapper">
            <table className="medical-reports-table">
              <thead>
                <tr>
                  <th>رقم المريض</th>
                  <th>اسم المريض</th>
                  <th>وصف الخدمة</th>
                  <th>اسم الطبيب</th>
                  <th>اسم المركز / القسم</th>
                  <th>تاريخ الطلب</th>
                  <th>رابط التقرير</th>
                  <th>ملف PDF / النتائج</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.map((report) => {
                  const reportUrl = getReportUrl(report);
                  const attachmentHref = getReportAttachmentHref(report);
                  const imageUrl = report.labRequest?.imageUrl ?? null;
                  const resultText = report.labRequest?.resultValue
                    ? joinMeta([
                        report.labRequest.resultValue,
                        report.labRequest.unit,
                        report.labRequest.normalRange ? `الطبيعي: ${report.labRequest.normalRange}` : null
                      ])
                    : null;

                  return (
                    <tr
                      className={highlightedReportId === report.id ? "target-highlight" : undefined}
                      id={report.id}
                      key={`${report.source}-${report.id}`}
                    >
                      <td>{report.patient.medicalRecordNumber}</td>
                      <td><strong>{report.patient.fullName}</strong></td>
                      <td>
                        <strong>{getReportServiceDescription(report)}</strong>
                        <button
                          className="medical-report-details-button"
                          type="button"
                          onClick={() => openPanel({ kind: "report", id: report.id })}
                        >
                          عرض التفاصيل
                        </button>
                      </td>
                      <td>{report.doctor.fullName}</td>
                      <td>{joinMeta([report.center.name, report.department.name])}</td>
                      <td>{formatDate(getReportRequestedAt(report))}</td>
                      <td>
                        {reportUrl ? (
                          <a className="medical-report-link" href={reportUrl} rel="noreferrer" target="_blank">
                            فتح التقرير
                          </a>
                        ) : (
                          <span className="muted">لا يوجد رابط</span>
                        )}
                      </td>
                      <td>
                        {attachmentHref ? (
                          <a
                            className="medical-report-link"
                            download={report.attachment?.fileName}
                            href={attachmentHref}
                          >
                            {report.attachment?.mimeType.includes("pdf") ? "فتح PDF" : "تنزيل الملف"}
                          </a>
                        ) : imageUrl ? (
                          <a className="medical-report-link" href={imageUrl} rel="noreferrer" target="_blank">
                            فتح الصورة
                          </a>
                        ) : resultText ? (
                          <span>{resultText}</span>
                        ) : (
                          <span className="muted">لا يوجد ملف</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {paginatedReports.length === 0 ? (
                  <tr>
                    <td className="medical-reports-empty-cell" colSpan={8}>لا يوجد بيانات متاحة في الجدول</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="medical-reports-table-footer">
            <p>يعرض {reportRangeStart} إلى {reportRangeEnd} من أصل {filteredReports.length} مدخل</p>
            <div className="pagination-bar medical-reports-pagination">
              <button className="ghost-button" type="button" disabled={currentReportPage === 1} onClick={() => setReportPage(1)}>الأول</button>
              <button className="ghost-button" type="button" disabled={currentReportPage === 1} onClick={() => setReportPage((page) => Math.max(1, page - 1))}>السابق</button>
              <button className="ghost-button" type="button" disabled={currentReportPage >= reportPageCount} onClick={() => setReportPage((page) => Math.min(reportPageCount, page + 1))}>التالي</button>
              <button className="ghost-button" type="button" disabled={currentReportPage >= reportPageCount} onClick={() => setReportPage(reportPageCount)}>الأخير</button>
            </div>
          </div>
        </div>

        <div className="stack-list compact legacy-report-cards" aria-hidden="true">
          {filteredReports.map((report) => {
            return (
              <article
                className={`stack-item interactive-card${highlightedReportId === report.id ? " target-highlight" : ""}`}
                id={report.id}
                key={`${report.source}-${report.id}`}
                role="button"
                tabIndex={0}
                onClick={() => openPanel({ kind: "report", id: report.id })}
                onKeyDown={(event) => handlePanelActivation(event, { kind: "report", id: report.id })}
              >
                <div className="info-row">
                  <div>
                    <strong>{report.reason}</strong>
                    <p className="muted">{report.summary ?? report.notes ?? "تقرير محفوظ ضمن السجل الصحي."}</p>
                  </div>
                  <StatusBadge status={report.status} />
                </div>
                <div className="tile-stats">
                  <span>{formatDateTime(report.scheduledAt)}</span>
                  <span>{report.doctor.fullName}</span>
                  <span>{report.department.name}</span>
                </div>
              </article>
            );
          })}
          {filteredReports.length === 0 ? <div className="empty-state compact">لا توجد تقارير مطابقة للبحث الحالي.</div> : null}
        </div>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div><p className="eyebrow">المواعيد القادمة</p><h3>زيارات مجدولة</h3></div>
            <Link className="ghost-button" to="/appointments">فتح المواعيد</Link>
          </div>
          <div className="stack-list compact">
            {record.upcomingAppointments.map((appointment) => (
              <Link className="stack-item interactive-card" key={appointment.id} to={`/appointments?appointmentId=${appointment.id}`}>
                <strong>{appointment.doctor.fullName}</strong>
                <p>{appointment.reason}</p>
                <div className="tile-stats">
                  <span>{formatDateTime(appointment.scheduledAt)}</span>
                  <span>{appointment.department.name}</span>
                  <span>{toArabicLabel(appointment.status)}</span>
                </div>
              </Link>
            ))}
            {record.upcomingAppointments.length === 0 ? <div className="empty-state compact">لا توجد مواعيد قادمة.</div> : null}
          </div>
        </article>

        <article className="section-card">
          <div className="section-header">
            <div><p className="eyebrow">الإحالات</p><h3>طلبات إحالة ومتابعة</h3></div>
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
                <div className="info-row">
                  <div><strong>{referral.reason}</strong><p className="muted">{referral.toCenter.name}</p></div>
                  <StatusBadge status={referral.status} />
                </div>
                <div className="tile-stats">
                  <span>{formatDate(referral.createdAt)}</span>
                  <span>{toArabicLabel(referral.priority)}</span>
                </div>
              </article>
            ))}
            {record.referrals.length === 0 ? <div className="empty-state compact">لا توجد إحالات مسجلة.</div> : null}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div><p className="eyebrow">تجديد الدواء</p><h3>وصفات مؤهلة للطلب</h3></div>
          </div>
          {refillMessage ? <div className="success-banner">{refillMessage}</div> : null}
          {refillError ? <div className="error-banner">{refillError}</div> : null}
          <div className="stack-list compact">
            {(record.eligiblePrescriptions ?? []).map((prescription) => (
              <article className="stack-item" key={prescription.id}>
                <div className="info-row">
                  <div>
                    <strong>{prescription.medicineName}</strong>
                    <p className="muted">{joinMeta([prescription.dosage, prescription.duration, prescription.doctorName])}</p>
                  </div>
                  <button
                    className="ghost-button"
                    disabled={refillBusyId === prescription.id || prescription.latestRefillStatus === "REQUESTED"}
                    type="button"
                    onClick={() => void handleRequestRefill(prescription.id)}
                  >
                    طلب تجديد
                  </button>
                </div>
                <div className="tile-stats">
                  <span>{formatDate(prescription.issuedAt)}</span>
                  <span>{prescription.latestRefillStatus ? toArabicLabel(prescription.latestRefillStatus) : "مؤهل"}</span>
                </div>
              </article>
            ))}
            {(record.eligiblePrescriptions ?? []).length === 0 ? <div className="empty-state compact">لا توجد وصفات مؤهلة للتجديد حاليًا.</div> : null}
          </div>
        </article>

        <article className="section-card">
          <div className="section-header">
            <div><p className="eyebrow">تذكيرات المتابعة</p><h3>المهام العلاجية القادمة</h3></div>
          </div>
          <div className="stack-list compact">
            {(record.followUpReminders ?? []).map((reminder) => (
              <article className="stack-item" key={reminder.id}>
                <div className="info-row">
                  <div><strong>{reminder.reason}</strong><p className="muted">{reminder.doctorName}</p></div>
                  <StatusBadge status={reminder.status} />
                </div>
                <div className="tile-stats">
                  <span>{formatDate(reminder.dueDate)}</span>
                  <span>{reminder.visitSummary ?? "متابعة علاجية"}</span>
                </div>
                {reminder.notes ? <p className="muted">{reminder.notes}</p> : null}
              </article>
            ))}
            {(record.followUpReminders ?? []).length === 0 ? <div className="empty-state compact">لا توجد تذكيرات متابعة قادمة.</div> : null}
          </div>
        </article>
      </section>
    </div>
  );
}
