import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  invoice?: { amount: number; paidAmount: number; status?: string | null } | null;
  workflowTasks?: Array<{
    id: number;
    taskType: string;
    status: string;
    assignedRole?: string | null;
    instructions?: string | null;
    resultSummary?: string | null;
    completedAt?: string | null;
  }>;
  nursingAssessments?: Array<{
    id: number;
    bloodPressure?: string | null;
    temperature?: number | null;
    heartRate?: number | null;
    weightKg?: number | null;
    heightCm?: number | null;
    oxygenSaturation?: number | null;
    respiratoryRate?: number | null;
    bloodGlucose?: number | null;
    notes?: string | null;
    assessedAt?: string | null;
  }>;
  prescriptions?: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    duration?: string | null;
    quantity: number;
    instructions?: string | null;
    dispensed: boolean;
    dispensedAt?: string | null;
  }>;
  labRequests?: Array<{
    id: number;
    status: string;
    resultValue?: string | null;
    resultNotes?: string | null;
    resultDate?: string | null;
    test: { testName: string; category?: string | null };
  }>;
};

type IntakeOptions = {
  patients: Array<{ id: number; fullName: string; phone: string; unifiedId?: string | null }>;
  doctors: Array<{ id: number; fullName: string }>;
};

type Catalogs = {
  medicines: Array<{ id: number; medicineName: string; quantity: number; unit: string; sellingPrice: number }>;
  labTests: Array<{ id: number; testName: string; category: string; price: number }>;
  diseases: Array<{ id: number; name: string; category: string }>;
};

const statusLabels: Record<string, string> = {
  WAITING_RECEPTION: "بانتظار الاستقبال",
  WAITING_TRIAGE: "بانتظار التقييم التمريضي",
  WAITING_DOCTOR: "بانتظار الطبيب",
  WAITING_LAB: "بانتظار المختبر",
  WAITING_PHARMACY: "بانتظار الصيدلية",
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
  FAILED: "فشل الرفع",
  UPLOADED: "تم الرفع"
};

const visitTypeLabels: Record<string, string> = {
  CONSULTATION: "استشارة",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طوارئ",
  LAB: "مختبر"
};

const taskLabels: Record<string, string> = {
  RECEPTION_REGISTRATION: "تسجيل الاستقبال",
  NURSING_TRIAGE: "تقييم التمريض",
  DOCTOR_ASSESSMENT: "تقييم الطبيب",
  LAB_TEST: "فحوصات المختبر",
  PHARMACY_DISPENSING: "صرف الأدوية"
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

function formatDateTime(value?: string | null) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ar");
}

function priorityClass(priority: WorkflowVisit["priority"]) {
  if (priority === "EMERGENCY") return "danger";
  if (priority === "URGENT") return "warning";
  return "neutral";
}

function statusClass(status: string) {
  if (["COMPLETED", "UPLOADED", "READY_TO_UPLOAD"].includes(status)) return "success";
  if (["WAITING_LAB", "WAITING_PHARMACY", "WAITING_TRIAGE", "WAITING_DOCTOR"].includes(status)) return "warning";
  if (["CANCELLED", "FAILED"].includes(status)) return "danger";
  return "neutral";
}

export function VisitWorkflowPage() {
  const { user } = useAuth();
  const role = user?.role;
  const [visits, setVisits] = useState<WorkflowVisit[]>([]);
  const [intake, setIntake] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [catalogs, setCatalogs] = useState<Catalogs>({ medicines: [], labTests: [], diseases: [] });
  const [status, setStatus] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const canIntake = hasRole(role, ["CENTER_MANAGER", "RECEPTIONIST"]);
  const canAssess = hasRole(role, ["CENTER_MANAGER", "DOCTOR"]);
  const canViewReception = hasRole(role, ["CENTER_MANAGER", "RECEPTIONIST", "DOCTOR"]);
  const canViewNursing = hasRole(role, ["CENTER_MANAGER", "DOCTOR", "NURSE"]);
  const canViewDoctor = hasRole(role, ["CENTER_MANAGER", "DOCTOR"]);
  const canViewLab = hasRole(role, ["CENTER_MANAGER", "DOCTOR", "LAB_TECH"]);
  const canViewPharmacy = hasRole(role, ["CENTER_MANAGER", "DOCTOR", "PHARMACIST"]);
  const canEditNursing = hasRole(role, ["CENTER_MANAGER", "NURSE"]);
  const canEditLab = hasRole(role, ["CENTER_MANAGER", "LAB_TECH"]);
  const canEditPharmacy = hasRole(role, ["CENTER_MANAGER", "PHARMACIST"]);

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? null,
    [selectedVisitId, visits]
  );

  const loadVisits = useCallback(async () => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const loadedVisits = await apiRequest<WorkflowVisit[]>(`/center/visit-workflow${query}`);
    setVisits(loadedVisits);
    setSelectedVisitId((current) => (current && loadedVisits.some((visit) => visit.id === current) ? current : null));
  }, [status]);

  const loadPage = useCallback(async () => {
    try {
      setError("");
      const tasks: Promise<unknown>[] = [loadVisits()];
      if (canIntake || canAssess) {
        tasks.push(apiRequest<IntakeOptions>("/center/visit-workflow/intake-options").then(setIntake));
      }
      if (canAssess || role === "LAB_TECH" || role === "PHARMACIST") {
        tasks.push(apiRequest<Catalogs>("/center/visit-workflow/catalogs").then(setCatalogs));
      }
      await Promise.all(tasks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات الزيارات.");
    }
  }, [canAssess, canIntake, loadVisits, role]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function runAction(visitId: number, action: () => Promise<unknown>, successMessage = "تم حفظ التغييرات.") {
    try {
      setBusyId(visitId);
      setError("");
      setMessage("");
      await action();
      setMessage(successMessage);
      await loadVisits();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.");
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
      setMessage("تم تسجيل الزيارة وإرسالها إلى مسار التقييم.");
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

  function submitTriage(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/triage`, {
          method: "PATCH",
          body: JSON.stringify({
            bloodPressure: form.get("bloodPressure") || undefined,
            temperature: optionalNumber(form.get("temperature")),
            heartRate: optionalNumber(form.get("heartRate")),
            weightKg: optionalNumber(form.get("weightKg")),
            heightCm: optionalNumber(form.get("heightCm")),
            oxygenSaturation: optionalNumber(form.get("oxygenSaturation")),
            respiratoryRate: optionalNumber(form.get("respiratoryRate")),
            bloodGlucose: optionalNumber(form.get("bloodGlucose")),
            notes: form.get("notes") || undefined
          })
        }),
      "تم حفظ تقييم التمريض وإرساله للطبيب."
    );
  }

  function submitDoctorAssessment(event: FormEvent<HTMLFormElement>, visitId: number) {
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
            notes: form.get("notes") || undefined,
            prescriptions,
            labTestIds: form.getAll("labTestIds").map(Number)
          })
        }),
      "تم حفظ تقييم الطبيب وتحديث ملف الزيارة."
    );
  }

  function submitLabResult(visitId: number, requestId: number) {
    const resultValue = window.prompt("أدخل نتيجة الفحص");
    if (!resultValue?.trim()) return;

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/lab/${requestId}/result`, {
          method: "PATCH",
          body: JSON.stringify({ resultValue: resultValue.trim() })
        }),
      "تم إرسال نتيجة المختبر للطبيب."
    );
  }

  return (
    <div className="page-stack">
      <header className="page-panel section-header">
        <div>
          <p className="eyebrow">رحلة المريض داخل المركز</p>
          <h1>ملفات الزيارات والمتابعة</h1>
          <p className="muted">تظهر الملفات كعناوين مختصرة، ويفتح المستخدم الملف الذي يحتاجه فقط حسب صلاحيات دوره.</p>
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

      {canIntake ? (
        <SectionCard title="تسجيل زيارة جديدة" subtitle="إدخال المريض إلى النظام من الحجز أو الإحالة أو الوصول المباشر للمركز">
          <form className="form-grid" onSubmit={submitVisit}>
            <label className="field">
              <span>المريض</span>
              <select name="patientId" required defaultValue="">
                <option value="" disabled>
                  اختر المريض
                </option>
                {intake.patients.map((patient) => (
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
                {intake.doctors.map((doctor) => (
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
              <span>الوقت</span>
              <input name="visitTime" type="time" />
            </label>
            <label className="field">
              <span>نوع الزيارة</span>
              <select name="visitType" defaultValue="CONSULTATION">
                <option value="CONSULTATION">استشارة</option>
                <option value="FOLLOW_UP">متابعة</option>
                <option value="EMERGENCY">طوارئ</option>
                <option value="LAB">مختبر</option>
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

      <SectionCard title="جدول ملفات الزيارة" subtitle="اضغط فتح الملف لعرض التفاصيل، ولن تظهر الملفات مفتوحة كلها في نفس الوقت.">
        {visits.length > 0 ? (
          <div className="table-shell">
            <table className="data-table visit-files-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>الطبيب</th>
                  <th>حالة الملف</th>
                  <th>الأولوية</th>
                  <th>الأقسام المرتبطة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id} className={selectedVisitId === visit.id ? "is-selected" : undefined}>
                    <td>
                      <strong>{visit.patient.fullName}</strong>
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
                      تمريض: {visit.nursingAssessments?.length ?? 0} | أدوية: {visit.prescriptions?.length ?? 0} | مختبر:{" "}
                      {visit.labRequests?.length ?? 0}
                    </td>
                    <td>
                      <button
                        className={selectedVisitId === visit.id ? "primary-button" : "ghost-button"}
                        type="button"
                        onClick={() => setSelectedVisitId(visit.id)}
                      >
                        {selectedVisitId === visit.id ? "مفتوح" : "فتح الملف"}
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
            {canViewReception ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>البيانات الأساسية والاستقبال</h3>
                    <p className="muted">هذا القسم يوضح مصدر الزيارة وتعيين الطبيب والبيانات الأولية.</p>
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
                    <span>الرقم الموحد</span>
                    <strong>{valueOrDash(selectedVisit.patient.unifiedId)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>الطبيب المعين</span>
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
                  <div className="detail-field field-span-2">
                    <span>ملاحظات الاستقبال</span>
                    <strong>{valueOrDash(selectedVisit.notes)}</strong>
                  </div>
                </div>

                {canIntake && ["WAITING_RECEPTION", "WAITING_TRIAGE", "WAITING_DOCTOR"].includes(selectedVisit.workflowStatus) ? (
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
                        {intake.doctors.map((doctor) => (
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
            ) : null}

            {canViewNursing ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم التمريض</h3>
                    <p className="muted">القياسات والملاحظات التمريضية تظهر للطبيب، ولا يستطيع الطبيب تعديلها.</p>
                  </div>
                </header>

                {(selectedVisit.nursingAssessments?.length ?? 0) > 0 ? (
                  <div className="table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>وقت التقييم</th>
                          <th>ضغط الدم</th>
                          <th>الحرارة</th>
                          <th>النبض</th>
                          <th>الأكسجين</th>
                          <th>السكر</th>
                          <th>ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisit.nursingAssessments?.map((assessment) => (
                          <tr key={assessment.id}>
                            <td>{formatDateTime(assessment.assessedAt)}</td>
                            <td>{valueOrDash(assessment.bloodPressure)}</td>
                            <td>{valueOrDash(assessment.temperature)}</td>
                            <td>{valueOrDash(assessment.heartRate)}</td>
                            <td>{valueOrDash(assessment.oxygenSaturation)}</td>
                            <td>{valueOrDash(assessment.bloodGlucose)}</td>
                            <td>{valueOrDash(assessment.notes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state compact">لا توجد قياسات تمريضية مسجلة بعد.</div>
                )}

                {canEditNursing && selectedVisit.workflowStatus === "WAITING_TRIAGE" ? (
                  <form className="form-grid visit-inline-form" onSubmit={(event) => submitTriage(event, selectedVisit.id)}>
                    <label className="field">
                      <span>ضغط الدم</span>
                      <input name="bloodPressure" placeholder="120/80" />
                    </label>
                    <label className="field">
                      <span>الحرارة</span>
                      <input name="temperature" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>النبض</span>
                      <input name="heartRate" type="number" />
                    </label>
                    <label className="field">
                      <span>نسبة الأكسجين</span>
                      <input name="oxygenSaturation" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>الوزن</span>
                      <input name="weightKg" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>الطول</span>
                      <input name="heightCm" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>معدل التنفس</span>
                      <input name="respiratoryRate" type="number" />
                    </label>
                    <label className="field">
                      <span>سكر الدم</span>
                      <input name="bloodGlucose" type="number" step="0.1" />
                    </label>
                    <label className="field field-span-2">
                      <span>الملاحظات التمريضية</span>
                      <textarea name="notes" />
                    </label>
                    <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                      حفظ تقييم التمريض
                    </button>
                  </form>
                ) : null}
              </article>
            ) : null}

            {canViewDoctor ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم الطبيب</h3>
                    <p className="muted">التشخيص والخطة العلاجية وطلبات المختبر والصيدلية.</p>
                  </div>
                </header>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span>التشخيص</span>
                    <strong>{valueOrDash(selectedVisit.diagnosis)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>الأعراض بعد التقييم</span>
                    <strong>{valueOrDash(selectedVisit.symptoms)}</strong>
                  </div>
                  <div className="detail-field field-span-2">
                    <span>ملاحظات الطبيب</span>
                    <strong>{valueOrDash(selectedVisit.notes)}</strong>
                  </div>
                </div>

                {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(selectedVisit.workflowStatus) ? (
                  <form className="form-grid visit-inline-form" onSubmit={(event) => submitDoctorAssessment(event, selectedVisit.id)}>
                    <label className="field">
                      <span>التشخيص</span>
                      <input name="diagnosis" required minLength={3} list={`diseases-${selectedVisit.id}`} />
                      <datalist id={`diseases-${selectedVisit.id}`}>
                        {catalogs.diseases.map((disease) => (
                          <option key={disease.id} value={disease.name} />
                        ))}
                      </datalist>
                    </label>
                    <label className="field">
                      <span>الأعراض</span>
                      <textarea name="symptoms" />
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
                      <input name="duration" placeholder="مثال: 7 أيام" />
                    </label>
                    <label className="field">
                      <span>الكمية</span>
                      <input name="quantity" type="number" min="1" defaultValue="1" />
                    </label>
                    <label className="field">
                      <span>تعليمات الدواء</span>
                      <input name="instructions" />
                    </label>
                    <label className="field">
                      <span>ملاحظات الطبيب</span>
                      <textarea name="notes" />
                    </label>
                    <fieldset className="field field-span-2">
                      <legend>الفحوص المطلوبة</legend>
                      <div className="workflow-options">
                        {catalogs.labTests.map((test) => (
                          <label className="checkbox-field" key={test.id}>
                            <input type="checkbox" name="labTestIds" value={test.id} />
                            <span>
                              {test.testName} - {test.price.toFixed(2)} شيكل
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                      حفظ تقييم الطبيب
                    </button>
                  </form>
                ) : null}
              </article>
            ) : null}

            {canViewLab ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم المختبر</h3>
                    <p className="muted">الطبيب يرى الطلبات والنتائج فقط، أما إدخال النتيجة فيتم من موظف المختبر.</p>
                  </div>
                </header>
                {(selectedVisit.labRequests?.length ?? 0) > 0 ? (
                  <div className="table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>الفحص</th>
                          <th>التصنيف</th>
                          <th>الحالة</th>
                          <th>النتيجة</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisit.labRequests?.map((request) => (
                          <tr key={request.id}>
                            <td>{request.test.testName}</td>
                            <td>{valueOrDash(request.test.category)}</td>
                            <td>{request.status === "COMPLETED" ? "مكتمل" : "معلق"}</td>
                            <td>{request.status === "COMPLETED" ? valueOrDash(request.resultValue) : "بانتظار النتيجة"}</td>
                            <td>
                              {canEditLab && request.status !== "COMPLETED" ? (
                                <button
                                  className="primary-button"
                                  disabled={busyId === selectedVisit.id}
                                  type="button"
                                  onClick={() => submitLabResult(selectedVisit.id, request.id)}
                                >
                                  إضافة النتيجة
                                </button>
                              ) : (
                                <span className="muted">قراءة فقط</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state compact">لا توجد فحوص مطلوبة لهذه الزيارة.</div>
                )}
              </article>
            ) : null}

            {canViewPharmacy ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم الصيدلية</h3>
                    <p className="muted">الطبيب يرى حالة الصرف، والصيدلي يؤكد تسليم الأدوية المطلوبة.</p>
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
                          <th>حالة الصرف</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisit.prescriptions?.map((prescription) => (
                          <tr key={prescription.id}>
                            <td>{prescription.medicineName}</td>
                            <td>{prescription.dosage}</td>
                            <td>{valueOrDash(prescription.duration)}</td>
                            <td>{prescription.quantity}</td>
                            <td>{prescription.dispensed ? "تم إعطاء الدواء" : "بانتظار الصرف"}</td>
                            <td>
                              {canEditPharmacy && !prescription.dispensed ? (
                                <button
                                  className="primary-button"
                                  disabled={busyId === selectedVisit.id}
                                  type="button"
                                  onClick={() =>
                                    void runAction(
                                      selectedVisit.id,
                                      () =>
                                        apiRequest(`/center/visit-workflow/prescriptions/${prescription.id}/dispense`, {
                                          method: "PATCH"
                                        }),
                                      "تم تأكيد تسليم الدواء للمريض."
                                    )
                                  }
                                >
                                  تم التسليم
                                </button>
                              ) : (
                                <span className="muted">قراءة فقط</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state compact">لا توجد وصفات دوائية لهذه الزيارة.</div>
                )}
              </article>
            ) : null}

            {canViewReception && selectedVisit.workflowTasks?.length ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>مسار المهام</h3>
                    <p className="muted">ملخص سريع للمراحل التي مر بها ملف الزيارة داخل المركز.</p>
                  </div>
                </header>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>المهمة</th>
                        <th>الدور</th>
                        <th>الحالة</th>
                        <th>النتيجة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVisit.workflowTasks.map((task) => (
                        <tr key={task.id}>
                          <td>{taskLabels[task.taskType] ?? task.taskType}</td>
                          <td>{valueOrDash(task.assignedRole)}</td>
                          <td>{task.status === "COMPLETED" ? "مكتملة" : "قيد الانتظار"}</td>
                          <td>{valueOrDash(task.resultSummary ?? task.instructions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : null}

            {canViewReception && selectedVisit.invoice ? (
              <div className="inline-note">
                قيمة الفاتورة: {selectedVisit.invoice.amount.toFixed(2)} شيكل | المدفوع:{" "}
                {selectedVisit.invoice.paidAmount.toFixed(2)} شيكل
              </div>
            ) : null}

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
                        "تم إنشاء الفاتورة وتجهيز الملف للرفع."
                      )
                    }
                  >
                    إنشاء الفاتورة وتجهيز الملف
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
        <div className="empty-state">اختر ملف زيارة من الجدول لعرض تفاصيله.</div>
      ) : null}
    </div>
  );
}
