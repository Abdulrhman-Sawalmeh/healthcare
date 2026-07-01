import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";

type WorkflowVisit = {
  id: number;
  visitDate?: string | null;
  visitTime?: string | null;
  visitType?: string | null;
  symptoms?: string | null;
  notes?: string | null;
  bloodPressure?: string | null;
  temperature?: number | null;
  heartRate?: number | null;
  checkedInAt?: string | null;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  workflowStatus: string;
  uploadStatus: string;
  uploadError?: string | null;
  diagnosis?: string | null;
  patient: { fullName: string; phone: string; unifiedId?: string | null };
  doctor?: { id?: number; fullName: string } | null;
  invoice?: { amount: number; paidAmount?: number | null; status?: string | null } | null;
  prescriptions?: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    duration?: string | null;
    quantity: number;
    instructions?: string | null;
    dispensed?: boolean;
  }>;
  resultReports?: Array<{
    id: number;
    title: string;
    category: string;
    summary: string;
    reportUrl?: string | null;
    shareWithPatient: boolean;
    createdAt: string;
    author: {
      fullName: string;
      doctorProfile?: {
        specialization: string;
      } | null;
    };
  }>;
};

type IntakeOptions = {
  patients: Array<{ id: number; fullName: string; phone: string; unifiedId?: string | null }>;
  doctors: Array<{ id: number; fullName: string }>;
};

type Catalogs = {
  medicines: Array<{ id: number; medicineName: string; quantity: number; unit: string; sellingPrice: number }>;
};

const statusLabels: Record<string, string> = {
  WAITING_RECEPTION: "بانتظار الاستقبال",
  WAITING_DOCTOR: "بانتظار الطبيب",
  IN_TREATMENT: "قيد المعالجة",
  READY_TO_UPLOAD: "جاهز للرفع",
  UPLOAD_PENDING: "قيد الرفع",
  UPLOADED: "تم الرفع",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي"
};

const priorityLabels: Record<WorkflowVisit["priority"], string> = {
  NORMAL: "عادي",
  URGENT: "عاجل",
  EMERGENCY: "طارئ"
};

const uploadLabels: Record<string, string> = {
  NOT_READY: "غير جاهز",
  READY: "جاهز",
  QUEUED: "قيد الإرسال",
  UPLOADED: "تم الرفع",
  FAILED: "فشل الرفع"
};

const visitTypeLabels: Record<string, string> = {
  CONSULTATION: "استشارة",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طوارئ",
  LAB: "فحص"
};

const reportCategoryOptions = [
  { value: "LAB", label: "نتائج المختبر" },
  { value: "RADIOLOGY", label: "نتائج الأشعة" },
  { value: "IMAGING", label: "صور طبية" },
  { value: "GENERAL", label: "تقرير طبي" },
  { value: "CARDIOLOGY", label: "قلب وتخطيط" },
  { value: "MICROBIOLOGY", label: "زراعة ومختبر" },
  { value: "PATHOLOGY", label: "أنسجة وخزعات" },
  { value: "PROCEDURE", label: "إجراء طبي" }
];

const defaultReportLinkForm = {
  title: "",
  category: "LAB",
  reportUrl: ""
};

function optionalNumber(value: FormDataEntryValue | null) {
  return value ? Number(value) : undefined;
}

function hasRole(role: string | undefined, allowed: string[]) {
  return Boolean(role && allowed.includes(role));
}

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "غير مسجل" : String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ar");
}

function priorityClass(priority: WorkflowVisit["priority"]) {
  if (priority === "EMERGENCY") return "danger";
  if (priority === "URGENT") return "warning";
  return "neutral";
}

function statusClass(status: string) {
  if (["COMPLETED", "UPLOADED", "READY_TO_UPLOAD"].includes(status)) return "success";
  if (["WAITING_RECEPTION", "WAITING_DOCTOR"].includes(status)) return "warning";
  if (["CANCELLED", "FAILED"].includes(status)) return "danger";
  return "neutral";
}

function reportCategoryLabel(category: string) {
  return reportCategoryOptions.find((option) => option.value === category)?.label ?? category;
}

function patientNumber(visit: WorkflowVisit) {
  return visit.patient.unifiedId || visit.patient.phone || `زيارة ${visit.id}`;
}

function reportDepartment(report: NonNullable<WorkflowVisit["resultReports"]>[number]) {
  return report.author.doctorProfile?.specialization ?? reportCategoryLabel(report.category);
}

function workflowActionLabel(status: string) {
  if (status === "WAITING_DOCTOR") return "بدء المعالجة";
  if (status === "IN_TREATMENT") return "متابعة المعالجة";
  if (["READY_TO_UPLOAD", "UPLOAD_PENDING", "UPLOADED", "COMPLETED"].includes(status)) return "عرض الملف";
  return "فتح الملف";
}

export function VisitWorkflowPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const role = user?.role;
  const [visits, setVisits] = useState<WorkflowVisit[]>([]);
  const [options, setOptions] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [catalogs, setCatalogs] = useState<Catalogs>({ medicines: [] });
  const [status, setStatus] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reportLinkForm, setReportLinkForm] = useState(defaultReportLinkForm);
  const [highlightVisitId, setHighlightVisitId] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  const canIntake = hasRole(role, ["RECEPTIONIST"]);
  const canAssess = hasRole(role, ["DOCTOR"]);
  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? null,
    [selectedVisitId, visits]
  );
  const visitFileStats = useMemo(
    () => ({
      waitingDoctor: visits.filter((visit) => visit.workflowStatus === "WAITING_DOCTOR").length,
      inTreatment: visits.filter((visit) => visit.workflowStatus === "IN_TREATMENT").length,
      readyReports: visits.filter((visit) => ["READY_TO_UPLOAD", "COMPLETED", "UPLOADED"].includes(visit.workflowStatus)).length,
      urgent: visits.filter((visit) => visit.priority !== "NORMAL").length
    }),
    [visits]
  );

  const canAddReportLink =
    Boolean(selectedVisit?.diagnosis) && selectedVisit?.diagnosis !== "بانتظار تقييم الطبيب";

  const loadVisits = useCallback(async () => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const loadedVisits = await apiRequest<WorkflowVisit[]>(`/center/visit-workflow${query}`);
    setVisits(loadedVisits);
    setSelectedVisitId((current) => (current && loadedVisits.some((visit) => visit.id === current) ? current : null));
  }, [status]);

  const loadPage = useCallback(async () => {
    try {
      setError("");
      const requests: Promise<unknown>[] = [loadVisits()];
      if (canIntake || canAssess) {
        requests.push(apiRequest<IntakeOptions>("/center/visit-workflow/intake-options").then(setOptions));
      }
      if (canAssess) {
        requests.push(apiRequest<Catalogs>("/center/visit-workflow/catalogs").then(setCatalogs));
      }
      await Promise.all(requests);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات الزيارة.");
    }
  }, [canAssess, canIntake, loadVisits]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const visitId = Number(searchParams.get("visitId") ?? 0);

    if (visitId > 0 && status) {
      setStatus("");
      return;
    }

    const targetVisit = visits.find((visit) => visit.id === visitId);

    if (targetVisit) {
      void openVisitFile(targetVisit, true);
    }
  }, [searchParams, visits]);

  useEffect(() => {
    if (!highlightVisitId) {
      return;
    }

    rowRefs.current[highlightVisitId]?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    const timeout = window.setTimeout(() => {
      setHighlightVisitId(null);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [highlightVisitId]);

  async function runAction(visitId: number, action: () => Promise<unknown>, success: string) {
    try {
      setBusyId(visitId);
      setError("");
      setMessage("");
      await action();
      setMessage(success);
      await loadVisits();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.");
    } finally {
      setBusyId(null);
    }
  }

  async function openVisitFile(visit: WorkflowVisit, highlight = false) {
    setSelectedVisitId(visit.id);

    if (highlight) {
      setHighlightVisitId(visit.id);
    }

    if (!canAssess || visit.workflowStatus !== "WAITING_DOCTOR") {
      return;
    }

    try {
      setBusyId(visit.id);
      const updatedVisit = await apiRequest<WorkflowVisit>(`/center/visit-workflow/${visit.id}/start-treatment`, {
        method: "PATCH"
      });

      setVisits((current) =>
        current.map((item) => (item.id === updatedVisit.id ? { ...item, ...updatedVisit } : item))
      );
      setSelectedVisitId(updatedVisit.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر بدء معالجة ملف الزيارة.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      setBusyId(0);
      setError("");
      const createdVisit = await apiRequest<{ id: number }>("/center/visit-workflow", {
        method: "POST",
        body: JSON.stringify({
          patientId: Number(form.get("patientId")),
          doctorId: optionalNumber(form.get("doctorId")),
          visitDate: form.get("visitDate"),
          visitTime: form.get("visitTime") || undefined,
          visitType: form.get("visitType"),
          priority: form.get("priority"),
          symptoms: form.get("symptoms") || undefined,
          notes: form.get("notes") || undefined
        })
      });
      formElement.reset();
      setMessage("تم تسجيل الزيارة وتحويلها إلى الطبيب.");
      await loadVisits();
      setSelectedVisitId(createdVisit.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الزيارة.");
    } finally {
      setBusyId(null);
    }
  }

  function submitAssignDoctor(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/assign-doctor`, {
          method: "PATCH",
          body: JSON.stringify({ doctorId: Number(form.get("doctorId")) })
        }),
      "تم تعيين الطبيب لملف الزيارة."
    );
  }

  function submitAssessment(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const medicineId = optionalNumber(form.get("medicineId"));
    const prescriptions = medicineId
      ? [
          {
            medicineId,
            dosage: String(form.get("dosage") || ""),
            duration: String(form.get("duration") || ""),
            quantity: Number(form.get("quantity") || 1),
            instructions: form.get("instructions") || undefined
          }
        ]
      : [];

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/doctor`, {
          method: "PATCH",
          body: JSON.stringify({
            diagnosis: form.get("diagnosis"),
            symptoms: form.get("symptoms") || undefined,
            bloodPressure: form.get("bloodPressure") || undefined,
            temperature: optionalNumber(form.get("temperature")),
            heartRate: optionalNumber(form.get("heartRate")),
            notes: form.get("notes") || undefined,
            prescriptions
          })
        }),
      "تم حفظ تقييم الطبيب."
    );
  }

  function submitReportLink(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();

    if (!reportLinkForm.title.trim() || !reportLinkForm.reportUrl.trim()) {
      setError("أدخل عنوان التقرير ورابط التقرير قبل الحفظ.");
      return;
    }

    try {
      const reportUrl = new URL(reportLinkForm.reportUrl.trim());
      if (!["http:", "https:"].includes(reportUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      setError("أدخل رابط تقرير صالح يبدأ بـ http أو https.");
      return;
    }

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/report-link`, {
          method: "POST",
          body: JSON.stringify({
            title: reportLinkForm.title.trim(),
            category: reportLinkForm.category,
            reportUrl: reportLinkForm.reportUrl.trim(),
            shareWithPatient: true
          })
        }),
      "تم إرسال التقرير للمريض."
    ).then(() => {
      setReportLinkForm(defaultReportLinkForm);
    });
  }

  return (
    <div className="page-stack">
      <header className="page-panel section-header">
        <div>
          <p className="eyebrow">سير عمل الزيارة داخل المركز</p>
          <h1>ملفات الزيارة والمتابعة</h1>
          <p className="muted">تظهر الملفات في جدول، ويتم فتح ملف واحد فقط عند الحاجة لمراجعته أو تعديله.</p>
        </div>
        <label className="field">
          <span>حالة الملف</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">جميع الحالات</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      {canAssess ? (
        <section className="metric-grid">
          <article className="metric-card">
            <span className="eyebrow">بانتظار الطبيب</span>
            <h3>{visitFileStats.waitingDoctor}</h3>
            <p className="muted">ملفات جاهزة لبدء المعالجة السريرية.</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">قيد المعالجة</span>
            <h3>{visitFileStats.inTreatment}</h3>
            <p className="muted">ملفات بدأ تقييمها وتحتاج استكمال الخطة.</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">تقارير جاهزة</span>
            <h3>{visitFileStats.readyReports}</h3>
            <p className="muted">ملفات لها تقييم محفوظ أو تقرير جاهز للمتابعة.</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">أولوية مرتفعة</span>
            <h3>{visitFileStats.urgent}</h3>
            <p className="muted">زيارات عاجلة أو طارئة ضمن القائمة الحالية.</p>
          </article>
        </section>
      ) : null}

      {canIntake ? (
        <SectionCard title="تسجيل زيارة جديدة" subtitle="إدخال المريض من حجز موعد أو إحالة أو وصول مباشر إلى المركز">
          <form className="form-grid" onSubmit={submitVisit}>
            <label className="field">
              <span>المريض</span>
              <select name="patientId" required defaultValue="">
                <option value="" disabled>
                  اختر المريض
                </option>
                {options.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName} - {patient.phone}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الطبيب</span>
              <select name="doctorId" defaultValue="">
                <option value="">يحدد لاحقًا</option>
                {options.doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>تاريخ الزيارة</span>
              <input name="visitDate" type="date" required />
            </label>
            <label className="field">
              <span>وقت الزيارة</span>
              <input name="visitTime" type="time" />
            </label>
            <label className="field">
              <span>نوع الزيارة</span>
              <select name="visitType" defaultValue="CONSULTATION">
                <option value="CONSULTATION">استشارة</option>
                <option value="FOLLOW_UP">متابعة</option>
                <option value="EMERGENCY">طوارئ</option>
                <option value="LAB">فحص</option>
              </select>
            </label>
            <label className="field">
              <span>الأولوية</span>
              <select name="priority" defaultValue="NORMAL">
                <option value="NORMAL">عادي</option>
                <option value="URGENT">عاجل</option>
                <option value="EMERGENCY">طارئ</option>
              </select>
            </label>
            <label className="field">
              <span>الأعراض الأولية</span>
              <textarea name="symptoms" />
            </label>
            <label className="field">
              <span>ملاحظات الاستقبال</span>
              <textarea name="notes" />
            </label>
            <button className="primary-button" disabled={busyId === 0} type="submit">
              تسجيل الزيارة
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="جدول ملفات الزيارة" subtitle="كل زيارة تظهر كسطر مستقل، والتفاصيل تظهر فقط بعد اختيار الملف.">
        {visits.length > 0 ? (
          <div className="table-shell">
            <table className="data-table visit-files-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>الطبيب</th>
                  <th>حالة الملف</th>
                  <th>الأولوية</th>
                  <th>وصفات هذه الزيارة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr
                    key={visit.id}
                    ref={(element) => {
                      rowRefs.current[visit.id] = element;
                    }}
                    className={[
                      selectedVisitId === visit.id ? "is-selected" : "",
                      highlightVisitId === visit.id ? "visit-file-row-highlight" : ""
                    ].filter(Boolean).join(" ") || undefined}
                  >
                    <td>
                      <strong>{visit.patient.fullName}</strong>
                      <span>
                        {formatDate(visit.visitDate)} {visit.visitTime ? `- ${visit.visitTime}` : ""} |{" "}
                        {visitTypeLabels[visit.visitType ?? ""] ?? valueOrDash(visit.visitType)}
                      </span>
                      <span>{visit.patient.phone}</span>
                    </td>
                    <td>{visit.doctor?.fullName ?? "لم يحدد بعد"}</td>
                    <td>
                      <span className={`status-badge ${statusClass(visit.workflowStatus)}`}>
                        {statusLabels[visit.workflowStatus] ?? visit.workflowStatus}
                      </span>
                      <span>{uploadLabels[visit.uploadStatus] ?? visit.uploadStatus}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${priorityClass(visit.priority)}`}>
                        {priorityLabels[visit.priority]}
                      </span>
                    </td>
                    <td>
                      {["WAITING_RECEPTION", "WAITING_DOCTOR"].includes(visit.workflowStatus)
                        ? "بانتظار الطبيب"
                        : visit.prescriptions?.length ?? 0}
                    </td>
                    <td>
                      <button
                        className={selectedVisitId === visit.id ? "primary-button" : "ghost-button"}
                        type="button"
                        onClick={() => void openVisitFile(visit)}
                        disabled={busyId === visit.id}
                      >
                        {busyId === visit.id ? "جارٍ الفتح..." : selectedVisitId === visit.id ? "مفتوح" : workflowActionLabel(visit.workflowStatus)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">لا توجد ملفات زيارة ضمن هذا التصنيف.</div>
        )}
      </SectionCard>

      {selectedVisit ? (
        <SectionCard
          title={`ملف زيارة ${selectedVisit.patient.fullName}`}
          subtitle={`رقم الملف ${selectedVisit.id} | ${statusLabels[selectedVisit.workflowStatus] ?? selectedVisit.workflowStatus}`}
          action={
            <button className="ghost-button" type="button" onClick={() => setSelectedVisitId(null)}>
              إغلاق الملف
            </button>
          }
        >
          {selectedVisit.uploadError ? <div className="error-banner">{selectedVisit.uploadError}</div> : null}
          <div className="visit-section-stack">
            <article className="visit-file-section">
              <header className="section-header">
                <div>
                  <h3>البيانات الأساسية والاستقبال</h3>
                  <p className="muted">تعريف المريض ومصدر الزيارة والطبيب المسؤول عنها.</p>
                </div>
              </header>
              <div className="detail-grid">
                <div className="detail-field">
                  <span>اسم المريض</span>
                  <strong>{selectedVisit.patient.fullName}</strong>
                </div>
                <div className="detail-field">
                  <span>هاتف المريض</span>
                  <strong>{selectedVisit.patient.phone}</strong>
                </div>
                <div className="detail-field">
                  <span>الطبيب</span>
                  <strong>{selectedVisit.doctor?.fullName ?? "لم يحدد بعد"}</strong>
                </div>
                <div className="detail-field">
                  <span>نوع الزيارة</span>
                  <strong>{visitTypeLabels[selectedVisit.visitType ?? ""] ?? valueOrDash(selectedVisit.visitType)}</strong>
                </div>
                <div className="detail-field">
                  <span>تاريخ الزيارة</span>
                  <strong>{formatDate(selectedVisit.visitDate)}</strong>
                </div>
                <div className="detail-field">
                  <span>وقت الزيارة</span>
                  <strong>{valueOrDash(selectedVisit.visitTime)}</strong>
                </div>
                <div className="detail-field">
                  <span>الأعراض الأولية</span>
                  <strong>{valueOrDash(selectedVisit.symptoms)}</strong>
                </div>
                <div className="detail-field">
                  <span>ملاحظات الاستقبال</span>
                  <strong>{valueOrDash(selectedVisit.notes)}</strong>
                </div>
              </div>

              {canIntake && ["WAITING_RECEPTION", "WAITING_DOCTOR"].includes(selectedVisit.workflowStatus) ? (
                <form
                  className="form-grid visit-inline-form"
                  onSubmit={(event) => submitAssignDoctor(event, selectedVisit.id)}
                  key={`assign-${selectedVisit.id}-${selectedVisit.doctor?.id ?? "none"}`}
                >
                  <label className="field">
                    <span>تعيين الطبيب</span>
                    <select name="doctorId" required defaultValue={selectedVisit.doctor?.id ? String(selectedVisit.doctor.id) : ""}>
                      <option value="" disabled>
                        اختر الطبيب
                      </option>
                      {options.doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                    حفظ تعيين الطبيب
                  </button>
                </form>
              ) : null}
            </article>

            <article className="visit-file-section">
              <header className="section-header">
                <div>
                  <h3>إضافة تقرير طبي</h3>
                  <p className="muted">بعد حفظ تقييم الطبيب، أرفق رابط التقرير الخارجي وحدد ظهوره للمريض من صفحة مستقلة.</p>
                </div>
              </header>
              {!canAddReportLink && canAssess ? (
                <div className="inline-note">احفظ تقييم الطبيب أولاً، ثم أضف رابط التقرير الخارجي للمريض.</div>
              ) : null}
              <form onSubmit={(event) => submitReportLink(event, selectedVisit.id)}>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>رقم المريض</th>
                        <th>اسم المريض</th>
                        <th>اسم الطبيب</th>
                        <th>اسم القسم</th>
                        <th>تاريخ الطلب</th>
                        <th>نوع التقرير</th>
                        <th>إرفاق رابط تقرير خارجي</th>
                        <th>الإجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canAssess && canAddReportLink ? (
                        <tr>
                          <td>{patientNumber(selectedVisit)}</td>
                          <td>{selectedVisit.patient.fullName}</td>
                          <td>{selectedVisit.doctor?.fullName ?? user?.fullName ?? "الطبيب الحالي"}</td>
                          <td>{reportCategoryLabel(reportLinkForm.category)}</td>
                          <td>{formatDate(selectedVisit.visitDate)}</td>
                          <td>
                            <select
                              value={reportLinkForm.category}
                              onChange={(event) =>
                                setReportLinkForm((current) => ({ ...current, category: event.target.value }))
                              }
                            >
                              {reportCategoryOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input
                              value={reportLinkForm.title}
                              onChange={(event) =>
                                setReportLinkForm((current) => ({ ...current, title: event.target.value }))
                              }
                              placeholder="عنوان التقرير"
                              required
                            />
                          </td>
                          <td>
                            <input
                              dir="ltr"
                              type="url"
                              value={reportLinkForm.reportUrl}
                              onChange={(event) =>
                                setReportLinkForm((current) => ({ ...current, reportUrl: event.target.value }))
                              }
                              placeholder="https://example.com/report.pdf"
                              required
                            />
                          </td>
                          <td>
                            <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                              حفظ الرابط
                            </button>
                          </td>
                        </tr>
                      ) : null}
                      {selectedVisit.resultReports?.map((report) => (
                        <tr key={report.id}>
                          <td>{patientNumber(selectedVisit)}</td>
                          <td>{selectedVisit.patient.fullName}</td>
                          <td>{report.author.fullName}</td>
                          <td>{reportDepartment(report)}</td>
                          <td>{formatDate(report.createdAt)}</td>
                          <td>{report.title}</td>
                          <td>
                            {report.reportUrl ? (
                              <a href={report.reportUrl} rel="noreferrer" target="_blank">
                                فتح التقرير
                              </a>
                            ) : (
                              "لا يوجد رابط"
                            )}
                          </td>
                          <td>{report.shareWithPatient ? "ظاهر للمريض" : "داخلي"}</td>
                        </tr>
                      ))}
                      {(selectedVisit.resultReports?.length ?? 0) === 0 && (!canAssess || !canAddReportLink) ? (
                        <tr>
                          <td colSpan={8}>لا توجد روابط تقارير محفوظة لهذا الملف.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </form>
            </article>

            <article className="visit-file-section">
              <header className="section-header">
                <div>
                  <h3>قسم الطبيب</h3>
                  <p className="muted">التشخيص والقياسات والخطة العلاجية في المركز الصغير.</p>
                </div>
              </header>
              <div className="detail-grid">
                <div className="detail-field">
                  <span>التشخيص</span>
                  <strong>{valueOrDash(selectedVisit.diagnosis)}</strong>
                </div>
                <div className="detail-field">
                  <span>ضغط الدم</span>
                  <strong>{valueOrDash(selectedVisit.bloodPressure)}</strong>
                </div>
                <div className="detail-field">
                  <span>الحرارة</span>
                  <strong>{valueOrDash(selectedVisit.temperature)}</strong>
                </div>
                <div className="detail-field">
                  <span>النبض</span>
                  <strong>{valueOrDash(selectedVisit.heartRate)}</strong>
                </div>
                <div className="detail-field field-span-2">
                  <span>ملاحظات الطبيب</span>
                  <strong>{valueOrDash(selectedVisit.notes)}</strong>
                </div>
              </div>

              {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(selectedVisit.workflowStatus) ? (
                <form className="form-grid visit-inline-form" onSubmit={(event) => submitAssessment(event, selectedVisit.id)}>
                  <label className="field field-span-2">
                    <span>التشخيص</span>
                    <input name="diagnosis" required minLength={3} />
                  </label>
                  <label className="field">
                    <span>الأعراض</span>
                    <textarea name="symptoms" />
                  </label>
                  <label className="field">
                    <span>ملاحظات الطبيب</span>
                    <textarea name="notes" />
                  </label>
                  <label className="field">
                    <span>ضغط الدم</span>
                    <input name="bloodPressure" placeholder="120/80" />
                  </label>
                  <label className="field">
                    <span>درجة الحرارة</span>
                    <input name="temperature" type="number" step="0.1" />
                  </label>
                  <label className="field">
                    <span>معدل النبض</span>
                    <input name="heartRate" type="number" />
                  </label>
                  <label className="field">
                    <span>دواء من المخزون</span>
                    <select name="medicineId" defaultValue="">
                      <option value="">دون وصفة دوائية</option>
                      {catalogs.medicines.map((medicine) => (
                        <option key={medicine.id} value={medicine.id}>
                          {medicine.medicineName} - المتاح {medicine.quantity} {medicine.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>الجرعة</span>
                    <input name="dosage" placeholder="مثال: حبة مرتين يوميًا" />
                  </label>
                  <label className="field">
                    <span>المدة</span>
                    <input name="duration" placeholder="مثال: خمسة أيام" />
                  </label>
                  <label className="field">
                    <span>الكمية</span>
                    <input name="quantity" type="number" min="1" defaultValue="1" />
                  </label>
                  <label className="field">
                    <span>تعليمات الدواء</span>
                    <input name="instructions" />
                  </label>
                  <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                    حفظ تقييم الطبيب
                  </button>
                </form>
              ) : null}
            </article>

            <article className="visit-file-section">
              <header className="section-header">
                <div>
                  <h3>الوصفات الدوائية</h3>
                  <p className="muted">الأدوية التي أضافها الطبيب لهذا الملف.</p>
                </div>
              </header>
              {(selectedVisit.prescriptions?.length ?? 0) > 0 ? (
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>الدواء</th>
                        <th>الجرعة</th>
                        <th>المدة</th>
                        <th>الكمية</th>
                        <th>ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVisit.prescriptions?.map((item) => (
                        <tr key={item.id}>
                          <td>{item.medicineName}</td>
                          <td>{item.dosage}</td>
                          <td>{valueOrDash(item.duration)}</td>
                          <td>{item.quantity}</td>
                          <td>{valueOrDash(item.instructions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state compact">لا توجد وصفات دوائية لهذه الزيارة.</div>
              )}
            </article>

            {canAssess ? (
              <div className="visit-detail-actions">
                {selectedVisit.workflowStatus === "READY_TO_UPLOAD" && selectedVisit.uploadStatus === "NOT_READY" ? (
                  <button
                    className="primary-button"
                    disabled={busyId === selectedVisit.id}
                    type="button"
                    onClick={() =>
                      void runAction(
                        selectedVisit.id,
                        () => apiRequest(`/center/visit-workflow/${selectedVisit.id}/complete`, { method: "POST" }),
                        "تم تجهيز ملف الزيارة للإرسال."
                      )
                    }
                  >
                    تجهيز الملف للإرسال
                  </button>
                ) : null}
                {["READY", "FAILED"].includes(selectedVisit.uploadStatus) ? (
                  <button
                    className="primary-button"
                    disabled={busyId === selectedVisit.id}
                    type="button"
                    onClick={() =>
                      void runAction(
                        selectedVisit.id,
                        () => apiRequest(`/center/visit-workflow/${selectedVisit.id}/upload`, { method: "POST" }),
                        "تم رفع الزيارة إلى النظام المركزي."
                      )
                    }
                  >
                    {selectedVisit.uploadStatus === "FAILED" ? "إعادة محاولة الرفع" : "رفع إلى النظام المركزي"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : visits.length > 0 ? (
        <div className="empty-state">اختر ملف زيارة من الجدول لعرض التفاصيل الطبية وخطة المعالجة.</div>
      ) : null}
    </div>
  );
}
