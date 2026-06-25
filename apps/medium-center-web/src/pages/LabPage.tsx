import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { LabBundle } from "../types";

type LabRequest = LabBundle["requests"][number];

const filterStatuses = [
  "NEW",
  "PENDING_SAMPLE",
  "SAMPLE_RECEIVED",
  "IN_PROGRESS",
  "RESULT_READY",
  "SENT_TO_DOCTOR",
  "NEEDS_CORRECTION",
  "PUBLISHED_TO_PATIENT",
  "INVALID_SAMPLE"
] as const;

const labStatusDescriptions: Record<string, string> = {
  NEW: "أنشأ الطبيب الطلب ولم يبدأ المختبر بمعالجته بعد.",
  PENDING_SAMPLE: "المختبر بانتظار وصول العينة من المريض أو التمريض.",
  SAMPLE_RECEIVED: "أكد فني المختبر استلام العينة.",
  IN_PROGRESS: "بدأ فني المختبر معالجة العينة وإجراء الفحص.",
  RESULT_READY: "أُدخلت النتيجة ولم تُرسل للطبيب بعد.",
  SENT_TO_DOCTOR: "أُرسلت النتيجة للطبيب للمراجعة.",
  NEEDS_CORRECTION: "طلب الطبيب تعديل النتيجة أو استكمال بياناتها.",
  PUBLISHED_TO_PATIENT: "اعتمد الطبيب النتيجة ونشرها للمريض.",
  INVALID_SAMPLE: "سجل المختبر أن العينة غير صالحة مع توضيح السبب."
};

const invalidSampleReasons = [
  "عينة غير صالحة",
  "عينة متجلطة",
  "كمية غير كافية",
  "بيانات العينة غير واضحة",
  "سبب آخر"
];

const sampleReceivedStatuses = new Set([
  "SAMPLE_RECEIVED",
  "IN_PROGRESS",
  "RESULT_READY",
  "SENT_TO_DOCTOR",
  "NEEDS_CORRECTION",
  "COMPLETED",
  "PUBLISHED_TO_PATIENT"
]);

const testingStartedStatuses = new Set([
  "IN_PROGRESS",
  "RESULT_READY",
  "SENT_TO_DOCTOR",
  "NEEDS_CORRECTION",
  "COMPLETED",
  "PUBLISHED_TO_PATIENT"
]);

const invalidSampleAllowedStatuses = new Set([
  "NEW",
  "PENDING",
  "PENDING_SAMPLE",
  "SAMPLE_RECEIVED",
  "IN_PROGRESS",
  "RESULT_READY",
  "NEEDS_CORRECTION"
]);

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isDelayed(request: LabRequest) {
  if (["SENT_TO_DOCTOR", "PUBLISHED_TO_PATIENT", "INVALID_SAMPLE", "CANCELLED", "COMPLETED"].includes(request.status)) {
    return false;
  }

  return Date.now() - new Date(request.requestDate).getTime() > 24 * 60 * 60 * 1000;
}

function hasResult(request: LabRequest) {
  return Boolean(request.resultValue || request.resultNotes || request.reportUrl || request.imageUrl || request.resultFileName);
}

function requestTimeline(request: LabRequest) {
  return [
    { label: "أنشأ الطبيب الطلب", date: request.requestDate, done: true },
    {
      label: "العينة بانتظار الاستلام",
      date: null,
      done: request.status === "PENDING_SAMPLE" || sampleReceivedStatuses.has(request.status)
    },
    { label: "تم استلام العينة", date: null, done: sampleReceivedStatuses.has(request.status) },
    { label: "بدأ الفحص", date: null, done: testingStartedStatuses.has(request.status) },
    { label: "أُدخلت النتيجة", date: request.resultDate, done: Boolean(request.resultDate) },
    { label: "أُرسلت للطبيب", date: request.sentToDoctorAt, done: Boolean(request.sentToDoctorAt) },
    ...(request.correctionReason
      ? [{ label: `طلب الطبيب تصحيح النتيجة: ${request.correctionReason}`, date: null, done: true }]
      : []),
    ...(request.status === "INVALID_SAMPLE"
      ? [{ label: `سُجلت عينة غير صالحة: ${request.resultNotes ?? "لم يسجل السبب"}`, date: null, done: true }]
      : []),
    { label: "نُشرت للمريض", date: request.publishedToPatientAt, done: Boolean(request.publishedToPatientAt) }
  ];
}

function detailsActionLabel(request: LabRequest) {
  if (request.status === "IN_PROGRESS") return "إدخال النتيجة";
  if (request.status === "NEEDS_CORRECTION") return "تعديل النتيجة وإعادة إرسالها";
  return "عرض التفاصيل";
}

export function LabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [labData, setLabData] = useState<LabBundle | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [invalidReason, setInvalidReason] = useState(invalidSampleReasons[0]);
  const [invalidReasonDetails, setInvalidReasonDetails] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const statusFilter = searchParams.get("status") ?? "";
  const criticalOnly = searchParams.get("critical") === "1";
  const overdueOnly = searchParams.get("overdue") === "1";
  const todayOnly = searchParams.get("today") === "1";
  const highlightedId = Number((searchParams.get("highlight") ?? "").replace("lab-request-", ""));

  async function loadData() {
    setLabData(await apiRequest<LabBundle>("/center/lab"));
  }

  useEffect(() => {
    void loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!highlightedId || !labData?.requests.some((request) => request.id === highlightedId)) {
      return;
    }

    setExpandedId(highlightedId);
    const timeout = window.setTimeout(() => {
      document.getElementById(`lab-request-${highlightedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [highlightedId, labData]);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (labData?.requests ?? []).filter((request) => {
      if (statusFilter && request.status !== statusFilter && !(statusFilter === "NEW" && request.status === "PENDING")) {
        return false;
      }
      if (criticalOnly && request.priority !== "CRITICAL" && request.abnormalFlag !== "CRITICAL") return false;
      if (overdueOnly && !isDelayed(request)) return false;
      if (
        todayOnly &&
        !isToday(request.resultDate) &&
        !isToday(request.sentToDoctorAt) &&
        !isToday(request.publishedToPatientAt)
      ) {
        return false;
      }
      if (!query) return true;

      return [
        request.id,
        request.patientNumber,
        request.patientName,
        request.testName,
        request.doctorName,
        request.status,
        request.priority
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [criticalOnly, labData, overdueOnly, search, statusFilter, todayOnly]);

  const selectedRequest = useMemo(
    () => labData?.requests.find((request) => request.id === expandedId) ?? null,
    [expandedId, labData]
  );

  async function runAction(requestId: number, action: () => Promise<unknown>, successMessage: string) {
    try {
      setBusyId(requestId);
      setError("");
      setMessage("");
      await action();
      await loadData();
      setExpandedId(requestId);
      setMessage(successMessage);
      window.dispatchEvent(new Event("healthcare-notifications-updated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ إجراء المختبر.");
    } finally {
      setBusyId(null);
    }
  }

  function updateStatus(requestId: number, status: string, note?: string) {
    return runAction(
      requestId,
      () =>
        apiRequest(`/center/lab/requests/${requestId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, note })
        }),
      status === "SAMPLE_RECEIVED"
        ? "تم تسجيل استلام العينة."
        : status === "IN_PROGRESS"
          ? "تم بدء الفحص."
          : status === "INVALID_SAMPLE"
            ? "تم تسجيل العينة غير الصالحة وإبلاغ الطبيب."
            : "تم تحديث حالة الطلب."
    );
  }

  function sendToDoctor(requestId: number) {
    return runAction(
      requestId,
      () => apiRequest(`/center/lab/requests/${requestId}/send-to-doctor`, { method: "POST" }),
      "تم إرسال النتيجة للطبيب للمراجعة."
    );
  }

  function submitResult(formElement: HTMLFormElement, request: LabRequest, action: string) {
    const form = new FormData(formElement);

    void runAction(
      request.id,
      () =>
        apiRequest(`/center/lab/requests/${request.id}/result`, {
          method: "PATCH",
          body: JSON.stringify({
            action,
            resultValue: form.get("resultValue") || undefined,
            resultNotes: form.get("resultNotes") || undefined,
            unit: form.get("unit") || undefined,
            normalRange: form.get("normalRange") || undefined,
            abnormalFlag: form.get("abnormalFlag") || "NORMAL",
            criticalNote: form.get("criticalNote") || undefined,
            reportUrl: form.get("reportUrl") || undefined,
            imageUrl: form.get("imageUrl") || undefined,
            doctorNotes: form.get("doctorNotes") || undefined
          })
        }),
      action === "SEND_TO_DOCTOR"
        ? "تم حفظ النتيجة وإرسالها للطبيب."
        : action === "MARK_READY"
          ? "تم حفظ النتيجة كجاهزة للإرسال."
          : "تم حفظ مسودة النتيجة."
    );
  }

  function markInvalidSample(requestId: number) {
    const note = invalidReason === "سبب آخر" ? invalidReasonDetails.trim() : invalidReason;

    if (!note) {
      setError("أدخل سبب عدم صلاحية العينة قبل الحفظ.");
      return;
    }

    void updateStatus(requestId, "INVALID_SAMPLE", note);
  }

  function openDetails(requestId: number) {
    setExpandedId((current) => (current === requestId ? null : requestId));
    setInvalidReason(invalidSampleReasons[0]);
    setInvalidReasonDetails("");
  }

  function setFilter(key: "status" | "critical" | "overdue" | "today", value?: string) {
    const next = new URLSearchParams(searchParams);
    next.delete("status");
    next.delete("critical");
    next.delete("overdue");
    next.delete("today");
    if (value) next.set(key, value);
    setSearchParams(next);
  }

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="empty-state compact">{message}</div> : null}

      <SectionCard
        title="إدارة طلبات الفحوصات"
        subtitle="استلام العينات، تنفيذ الفحوص، حفظ النتائج وإرسالها للطبيب. إنشاء الطلبات متاح للطبيب من ملف الزيارة."
      >
        <div className="lab-toolbar">
          <label className="field">
            <span>بحث في الطلبات</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="رقم الطلب، المريض، الفحص أو الطبيب"
            />
          </label>
          <div className="chip-row">
            <button className={!statusFilter && !criticalOnly && !overdueOnly && !todayOnly ? "primary-button" : "ghost-button"} type="button" onClick={() => setFilter("status")}>
              الكل
            </button>
            {filterStatuses.map((status) => (
              <button
                className={statusFilter === status ? "primary-button" : "ghost-button"}
                key={status}
                type="button"
                onClick={() => setFilter("status", status)}
              >
                {toArabicLabel(status)}
              </button>
            ))}
          </div>
        </div>

        <details className="lab-status-guide">
          <summary>دليل حالات الطلب والعينة</summary>
          <div className="lab-status-guide-grid">
            {filterStatuses.map((status) => (
              <div key={status}>
                <StatusBadge status={status} />
                <p>{labStatusDescriptions[status]}</p>
              </div>
            ))}
          </div>
        </details>

        {filteredRequests.length > 0 ? (
          <div className="table-shell lab-table-shell">
            <table className="data-table lab-requests-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>رقم المريض</th>
                  <th>اسم المريض</th>
                  <th>الفحص المطلوب</th>
                  <th>الطبيب الطالب</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>تاريخ الطلب</th>
                  <th>النتيجة المختصرة</th>
                  <th>الوحدة</th>
                  <th>النطاق الطبيعي</th>
                  <th>ملاحظة المختبر</th>
                  <th>التقرير</th>
                  <th>الصورة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const isExpanded = expandedId === request.id;
                  const isHighlighted = highlightedId === request.id;

                  return (
                    <tr
                      className={`${isHighlighted ? "target-highlight " : ""}${isExpanded ? "is-selected" : ""}`.trim() || undefined}
                      id={`lab-request-${request.id}`}
                      key={request.id}
                    >
                      <td>#{request.id}</td>
                      <td>{request.patientNumber ?? request.patientId}</td>
                      <td><strong>{request.patientName}</strong></td>
                      <td>{request.testName}</td>
                      <td>{request.doctorName}</td>
                      <td><StatusBadge status={request.priority ?? "NORMAL"} /></td>
                      <td><StatusBadge status={request.status} /></td>
                      <td>{formatDateTime(request.requestDate)}</td>
                      <td>
                        {request.resultValue ?? "بانتظار النتيجة"}
                        {request.abnormalFlag && request.abnormalFlag !== "NORMAL" ? (
                          <StatusBadge status={request.abnormalFlag} />
                        ) : null}
                      </td>
                      <td>{request.unit ?? "-"}</td>
                      <td>{request.normalRange ?? request.normalRangeCatalog ?? "-"}</td>
                      <td>{request.resultNotes ?? request.correctionReason ?? "-"}</td>
                      <td>
                        {request.reportUrl ? (
                          <a href={request.reportUrl} target="_blank" rel="noopener noreferrer">فتح التقرير</a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {request.imageUrl ? (
                          <a href={request.imageUrl} target="_blank" rel="noopener noreferrer">فتح الصورة</a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="button-row lab-actions">
                          {["NEW", "PENDING", "PENDING_SAMPLE"].includes(request.status) ? (
                            <button className="primary-button" disabled={busyId === request.id} type="button" onClick={() => void updateStatus(request.id, "SAMPLE_RECEIVED")}>
                              استلام العينة
                            </button>
                          ) : null}
                          {request.status === "SAMPLE_RECEIVED" ? (
                            <button className="primary-button" disabled={busyId === request.id} type="button" onClick={() => void updateStatus(request.id, "IN_PROGRESS")}>
                              بدء الفحص
                            </button>
                          ) : null}
                          {request.status === "RESULT_READY" ? (
                            <button className="primary-button" disabled={busyId === request.id} type="button" onClick={() => void sendToDoctor(request.id)}>
                              إرسال للطبيب
                            </button>
                          ) : null}
                          <button
                            className={request.status === "NEEDS_CORRECTION" ? "primary-button" : "ghost-button"}
                            type="button"
                            onClick={() => openDetails(request.id)}
                          >
                            {isExpanded ? "إغلاق التفاصيل" : detailsActionLabel(request)}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">لا توجد طلبات مختبر مطابقة للفلاتر الحالية.</div>
        )}
      </SectionCard>

      {selectedRequest ? (
        <SectionCard
          title={`تفاصيل طلب المختبر #${selectedRequest.id}`}
          subtitle={joinMeta([selectedRequest.patientName, selectedRequest.testName, selectedRequest.doctorName])}
          action={
            <button className="ghost-button" type="button" onClick={() => setExpandedId(null)}>
              إغلاق
            </button>
          }
        >
          <div className="lab-current-status">
            <StatusBadge status={selectedRequest.status} />
            <p>{labStatusDescriptions[selectedRequest.status] ?? toArabicLabel(selectedRequest.status)}</p>
          </div>

          <div className="lab-detail-grid">
            <section>
              <h3>ملخص الطلب</h3>
              <dl className="lab-facts">
                <div><dt>سبب الطلب</dt><dd>{selectedRequest.reason ?? "غير مسجل"}</dd></div>
                <div><dt>الملاحظات السريرية</dt><dd>{selectedRequest.clinicalNotes ?? "غير مسجلة"}</dd></div>
                <div><dt>نوع العينة</dt><dd>{selectedRequest.sampleType ?? "غير محدد"}</dd></div>
                <div><dt>الصيام</dt><dd>{selectedRequest.fastingRequired ? "مطلوب" : "غير مطلوب"}</dd></div>
                <div><dt>سياق الزيارة</dt><dd>{selectedRequest.visit ? joinMeta([`زيارة ${selectedRequest.visit.id}`, selectedRequest.visit.visitDate ? formatDateTime(selectedRequest.visit.visitDate) : null, selectedRequest.visit.diagnosis]) : "غير مرتبط بزيارة"}</dd></div>
                <div><dt>ملاحظة الطبيب</dt><dd>{selectedRequest.doctorNotes ?? "لا توجد"}</dd></div>
              </dl>
            </section>

            <section>
              <h3>مسار العينة والنتيجة</h3>
              <ol className="lab-timeline">
                {requestTimeline(selectedRequest).map((item, index) => (
                  <li className={item.done ? "is-done" : ""} key={`${item.label}-${index}`}>
                    <strong>{item.label}</strong>
                    <span>{item.date ? formatDateTime(item.date) : item.done ? "تم تسجيل المرحلة" : "بانتظار التنفيذ"}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {["IN_PROGRESS", "NEEDS_CORRECTION", "RESULT_READY"].includes(selectedRequest.status) ? (
            <form
              className="lab-result-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitResult(event.currentTarget, selectedRequest, "SAVE_DRAFT");
              }}
            >
              {selectedRequest.correctionReason ? (
                <div className="lab-correction-note lab-field-full">
                  <strong>طلب التصحيح من الطبيب</strong>
                  <p>{selectedRequest.correctionReason}</p>
                </div>
              ) : null}
              <label className="field">
                <span>النتيجة المختصرة</span>
                <input name="resultValue" defaultValue={selectedRequest.resultValue ?? ""} />
              </label>
              <label className="field">
                <span>الوحدة</span>
                <input name="unit" defaultValue={selectedRequest.unit ?? ""} />
              </label>
              <label className="field">
                <span>النطاق الطبيعي</span>
                <input name="normalRange" defaultValue={selectedRequest.normalRange ?? selectedRequest.normalRangeCatalog ?? ""} />
              </label>
              <label className="field">
                <span>تصنيف النتيجة</span>
                <select name="abnormalFlag" defaultValue={selectedRequest.abnormalFlag ?? "NORMAL"}>
                  <option value="NORMAL">طبيعية</option>
                  <option value="ABNORMAL">غير طبيعية</option>
                  <option value="CRITICAL">حرجة</option>
                </select>
              </label>
              <label className="field">
                <span>رابط التقرير / PDF</span>
                <input name="reportUrl" type="url" dir="ltr" defaultValue={selectedRequest.reportUrl ?? ""} placeholder="https://..." />
              </label>
              <label className="field">
                <span>رابط الصورة / المرفق</span>
                <input name="imageUrl" type="url" dir="ltr" defaultValue={selectedRequest.imageUrl ?? ""} placeholder="https://..." />
              </label>
              <label className="field lab-field-span-2">
                <span>ملاحظات المختبر</span>
                <textarea name="resultNotes" defaultValue={selectedRequest.resultNotes ?? ""} />
              </label>
              <label className="field">
                <span>ملاحظة الحالة الحرجة</span>
                <textarea name="criticalNote" defaultValue={selectedRequest.criticalNote ?? ""} />
              </label>
              <label className="field lab-field-full">
                <span>ملاحظة للطبيب</span>
                <textarea name="doctorNotes" defaultValue={selectedRequest.doctorNotes ?? ""} />
              </label>
              <div className="lab-field-full button-row">
                <button className="ghost-button" disabled={busyId === selectedRequest.id} type="submit">
                  حفظ كمسودة
                </button>
                <button className="ghost-button" disabled={busyId === selectedRequest.id} type="button" onClick={(event) => event.currentTarget.form && submitResult(event.currentTarget.form, selectedRequest, "MARK_READY")}>
                  حفظ كجاهزة للإرسال
                </button>
                <button className="primary-button" disabled={busyId === selectedRequest.id} type="button" onClick={(event) => event.currentTarget.form && submitResult(event.currentTarget.form, selectedRequest, "SEND_TO_DOCTOR")}>
                  {selectedRequest.status === "NEEDS_CORRECTION" ? "حفظ وإعادة الإرسال للطبيب" : "حفظ وإرسال للطبيب"}
                </button>
              </div>
            </form>
          ) : hasResult(selectedRequest) ? (
            <div className="lab-readonly-result">
              <strong>النتيجة</strong>
              <p>
                {joinMeta([
                  selectedRequest.resultValue,
                  selectedRequest.unit,
                  selectedRequest.normalRange ? `الطبيعي: ${selectedRequest.normalRange}` : null,
                  selectedRequest.abnormalFlag ? toArabicLabel(selectedRequest.abnormalFlag) : null
                ])}
              </p>
              <div className="button-row">
                {selectedRequest.reportUrl ? (
                  <a className="ghost-button" href={selectedRequest.reportUrl} target="_blank" rel="noopener noreferrer">فتح التقرير</a>
                ) : null}
                {selectedRequest.imageUrl ? (
                  <a className="ghost-button" href={selectedRequest.imageUrl} target="_blank" rel="noopener noreferrer">فتح الصورة</a>
                ) : null}
              </div>
            </div>
          ) : null}

          {invalidSampleAllowedStatuses.has(selectedRequest.status) ? (
            <div className="lab-quality-row">
              {selectedRequest.status === "NEW" ? (
                <button className="ghost-button" disabled={busyId === selectedRequest.id} type="button" onClick={() => void updateStatus(selectedRequest.id, "PENDING_SAMPLE")}>
                  تسجيل انتظار العينة
                </button>
              ) : null}
              <label className="field">
                <span>سبب عدم صلاحية العينة</span>
                <select value={invalidReason} onChange={(event) => setInvalidReason(event.target.value)}>
                  {invalidSampleReasons.map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </label>
              {invalidReason === "سبب آخر" ? (
                <label className="field">
                  <span>توضيح السبب</span>
                  <input value={invalidReasonDetails} onChange={(event) => setInvalidReasonDetails(event.target.value)} />
                </label>
              ) : null}
              <button className="danger-button" disabled={busyId === selectedRequest.id} type="button" onClick={() => markInvalidSample(selectedRequest.id)}>
                تسجيل عينة غير صالحة
              </button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
