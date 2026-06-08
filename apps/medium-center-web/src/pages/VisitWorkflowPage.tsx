import { FormEvent, useCallback, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";

type WorkflowVisit = {
  id: number;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  workflowStatus: string;
  uploadStatus: string;
  uploadError?: string | null;
  diagnosis?: string;
  patient: { fullName: string; phone: string };
  doctor?: { fullName: string } | null;
  invoice?: { amount: number; paidAmount: number; status: string } | null;
  prescriptions?: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    quantity: number;
    dispensed: boolean;
  }>;
  labRequests?: Array<{
    id: number;
    status: string;
    resultValue?: string | null;
    test: { testName: string };
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
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي"
};

const priorityLabels = { NORMAL: "عادي", URGENT: "عاجل", EMERGENCY: "طارئ" };
const uploadLabels: Record<string, string> = {
  NOT_READY: "غير جاهز",
  READY: "جاهز",
  QUEUED: "قيد الإرسال",
  FAILED: "فشل الرفع",
  UPLOADED: "تم الرفع"
};

function optionalNumber(value: FormDataEntryValue | null) {
  return value ? Number(value) : undefined;
}

export function VisitWorkflowPage() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<WorkflowVisit[]>([]);
  const [intake, setIntake] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [catalogs, setCatalogs] = useState<Catalogs>({ medicines: [], labTests: [], diseases: [] });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const canIntake = user?.role === "CENTER_MANAGER" || user?.role === "RECEPTIONIST";
  const canAssess = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";

  const loadVisits = useCallback(async () => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    setVisits(await apiRequest<WorkflowVisit[]>(`/center/visit-workflow${query}`));
  }, [status]);

  const loadPage = useCallback(async () => {
    try {
      setError("");
      const tasks: Promise<unknown>[] = [loadVisits()];
      if (canIntake || canAssess) {
        tasks.push(apiRequest<IntakeOptions>("/center/visit-workflow/intake-options").then(setIntake));
      }
      if (canAssess || user?.role === "LAB_TECH" || user?.role === "PHARMACIST") {
        tasks.push(apiRequest<Catalogs>("/center/visit-workflow/catalogs").then(setCatalogs));
      }
      await Promise.all(tasks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات الزيارات.");
    }
  }, [canAssess, canIntake, loadVisits, user?.role]);

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
      await apiRequest("/center/visit-workflow", {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الزيارة.");
    } finally {
      setBusyId(null);
    }
  }

  function submitTriage(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(visitId, () =>
      apiRequest(`/center/visit-workflow/${visitId}/triage`, {
        method: "PATCH",
        body: JSON.stringify({
          bloodPressure: form.get("bloodPressure") || undefined,
          temperature: optionalNumber(form.get("temperature")),
          heartRate: optionalNumber(form.get("heartRate")),
          oxygenSaturation: optionalNumber(form.get("oxygenSaturation")),
          notes: form.get("notes") || undefined
        })
      })
    );
  }

  function submitDoctorAssessment(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const medicineId = optionalNumber(form.get("medicineId"));
    const prescriptions = medicineId
      ? [{
          medicineId,
          dosage: String(form.get("dosage") || ""),
          duration: String(form.get("duration") || ""),
          quantity: Number(form.get("quantity") || 1),
          instructions: form.get("instructions") || undefined
        }]
      : [];

    void runAction(visitId, () =>
      apiRequest(`/center/visit-workflow/${visitId}/doctor`, {
        method: "PATCH",
        body: JSON.stringify({
          diagnosis: form.get("diagnosis"),
          symptoms: form.get("symptoms") || undefined,
          notes: form.get("notes") || undefined,
          prescriptions,
          labTestIds: form.getAll("labTestIds").map(Number)
        })
      })
    );
  }

  return (
    <div className="page-stack">
      <header className="page-panel section-header">
        <div>
          <p className="eyebrow">رحلة المريض داخل المركز</p>
          <h1>ملفات الزيارات والمتابعة</h1>
          <p className="muted">تظهر الحالات الطارئة أولاً، ثم العاجلة، ثم الحالات العادية.</p>
        </div>
        <label className="field">
          <span>حالة الملف</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">جميع الحالات</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      {canIntake ? (
        <SectionCard title="تسجيل زيارة جديدة" subtitle="اختيار المريض والطبيب ودرجة أولوية الحالة">
          <form className="form-grid" onSubmit={submitVisit}>
            <label className="field">
              <span>المريض</span>
              <select name="patientId" required defaultValue="">
                <option value="" disabled>اختر المريض</option>
                {intake.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.fullName} - {patient.phone}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الطبيب</span>
              <select name="doctorId" defaultValue="">
                <option value="">يحدد لاحقاً</option>
                {intake.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
              </select>
            </label>
            <label className="field"><span>تاريخ الزيارة</span><input name="visitDate" type="date" required /></label>
            <label className="field"><span>الوقت</span><input name="visitTime" type="time" /></label>
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
            <label className="field"><span>الأعراض الأولية</span><textarea name="symptoms" /></label>
            <label className="field"><span>ملاحظات الاستقبال</span><textarea name="notes" /></label>
            <button className="primary-button" disabled={busyId === 0} type="submit">تسجيل الزيارة</button>
          </form>
        </SectionCard>
      ) : null}

      {visits.map((visit) => (
        <SectionCard
          key={visit.id}
          title={`${visit.patient.fullName} - ملف زيارة رقم ${visit.id}`}
          subtitle={`${visit.patient.phone} | الطبيب: ${visit.doctor?.fullName ?? "لم يحدد بعد"}`}
        >
          <div className="section-header">
            <div>
              <strong>{statusLabels[visit.workflowStatus] ?? visit.workflowStatus}</strong>
              <p className="muted">التشخيص: {visit.diagnosis || "بانتظار الطبيب"}</p>
              <p className="muted">حالة الرفع: {uploadLabels[visit.uploadStatus] ?? visit.uploadStatus}</p>
            </div>
            <span className={`status-badge ${visit.priority === "EMERGENCY" ? "danger" : visit.priority === "URGENT" ? "warning" : "neutral"}`}>
              {priorityLabels[visit.priority]}
            </span>
          </div>

          {visit.uploadError ? <div className="error-banner">{visit.uploadError}</div> : null}
          {visit.invoice ? (
            <div className="inline-note">
              قيمة الفاتورة: {visit.invoice.amount.toFixed(2)} شيكل | المدفوع: {visit.invoice.paidAmount.toFixed(2)} شيكل
            </div>
          ) : null}

          {(user?.role === "NURSE" || user?.role === "CENTER_MANAGER") && visit.workflowStatus === "WAITING_TRIAGE" ? (
            <form className="form-grid" onSubmit={(event) => submitTriage(event, visit.id)}>
              <label className="field"><span>ضغط الدم</span><input name="bloodPressure" placeholder="120/80" /></label>
              <label className="field"><span>الحرارة</span><input name="temperature" type="number" step="0.1" /></label>
              <label className="field"><span>النبض</span><input name="heartRate" type="number" /></label>
              <label className="field"><span>نسبة الأكسجين</span><input name="oxygenSaturation" type="number" step="0.1" /></label>
              <label className="field field-span-2"><span>الملاحظات التمريضية</span><textarea name="notes" /></label>
              <button className="primary-button" disabled={busyId === visit.id} type="submit">حفظ التقييم التمريضي</button>
            </form>
          ) : null}

          {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(visit.workflowStatus) ? (
            <form className="form-grid" onSubmit={(event) => submitDoctorAssessment(event, visit.id)}>
              <label className="field">
                <span>التشخيص</span>
                <input name="diagnosis" required minLength={3} list={`diseases-${visit.id}`} />
                <datalist id={`diseases-${visit.id}`}>
                  {catalogs.diseases.map((disease) => <option key={disease.id} value={disease.name} />)}
                </datalist>
              </label>
              <label className="field"><span>الأعراض</span><textarea name="symptoms" /></label>
              <label className="field"><span>دواء من المخزون</span>
                <select name="medicineId" defaultValue="">
                  <option value="">دون وصفة دوائية</option>
                  {catalogs.medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.medicineName} - المتاح {medicine.quantity} {medicine.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field"><span>الجرعة</span><input name="dosage" placeholder="مثال: حبة مرتين يومياً" /></label>
              <label className="field"><span>المدة</span><input name="duration" placeholder="مثال: 7 أيام" /></label>
              <label className="field"><span>الكمية</span><input name="quantity" type="number" min="1" defaultValue="1" /></label>
              <label className="field"><span>تعليمات الدواء</span><input name="instructions" /></label>
              <label className="field"><span>ملاحظات الطبيب</span><textarea name="notes" /></label>
              <fieldset className="field field-span-2">
                <legend>الفحوص المطلوبة</legend>
                <div className="workflow-options">
                  {catalogs.labTests.map((test) => (
                    <label className="checkbox-field" key={test.id}>
                      <input type="checkbox" name="labTestIds" value={test.id} />
                      <span>{test.testName} - {test.price.toFixed(2)} شيكل</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="primary-button" disabled={busyId === visit.id} type="submit">حفظ تقييم الطبيب</button>
            </form>
          ) : null}

          {(user?.role === "LAB_TECH" || user?.role === "CENTER_MANAGER") && (visit.labRequests?.length ?? 0) > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>الفحص</th><th>الحالة</th><th>النتيجة</th></tr></thead>
                <tbody>{visit.labRequests?.map((request) => (
                  <tr key={request.id}>
                    <td>{request.test.testName}</td><td>{request.status === "COMPLETED" ? "مكتمل" : "معلق"}</td>
                    <td>{request.status === "COMPLETED" ? request.resultValue : (
                      <button className="primary-button" disabled={busyId === visit.id} type="button" onClick={() => {
                        const resultValue = window.prompt("أدخل نتيجة الفحص");
                        if (resultValue) void runAction(visit.id, () => apiRequest(`/center/visit-workflow/lab/${request.id}/result`, {
                          method: "PATCH", body: JSON.stringify({ resultValue })
                        }));
                      }}>إضافة النتيجة</button>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}

          {(user?.role === "PHARMACIST" || user?.role === "CENTER_MANAGER") && (visit.prescriptions?.length ?? 0) > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>الدواء</th><th>الجرعة</th><th>الكمية</th><th>الصرف</th></tr></thead>
                <tbody>{visit.prescriptions?.map((prescription) => (
                  <tr key={prescription.id}>
                    <td>{prescription.medicineName}</td><td>{prescription.dosage}</td><td>{prescription.quantity}</td>
                    <td>{prescription.dispensed ? "تم الصرف" : (
                      <button className="primary-button" disabled={busyId === visit.id} type="button" onClick={() =>
                        void runAction(visit.id, () => apiRequest(`/center/visit-workflow/prescriptions/${prescription.id}/dispense`, { method: "PATCH" }))
                      }>تأكيد تسليم الدواء</button>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}

          {canAssess && visit.workflowStatus === "READY_TO_UPLOAD" && visit.uploadStatus === "NOT_READY" ? (
            <button className="primary-button" disabled={busyId === visit.id} type="button" onClick={() =>
              void runAction(visit.id, () => apiRequest(`/center/visit-workflow/${visit.id}/complete`, { method: "POST" }), "تم إنشاء الفاتورة وتجهيز الملف للرفع.")
            }>إنشاء الفاتورة وتجهيز الملف</button>
          ) : null}

          {canAssess && ["READY", "FAILED"].includes(visit.uploadStatus) ? (
            <button className="primary-button" disabled={busyId === visit.id} type="button" onClick={() =>
              void runAction(visit.id, () => apiRequest(`/center/visit-workflow/${visit.id}/upload`, { method: "POST" }), "تم رفع الزيارة إلى النظام المركزي.")
            }>{visit.uploadStatus === "FAILED" ? "إعادة محاولة الرفع" : "رفع إلى النظام المركزي"}</button>
          ) : null}
        </SectionCard>
      ))}

      {visits.length === 0 ? <div className="empty-state">لا توجد ملفات زيارة ضمن هذا التصنيف.</div> : null}
    </div>
  );
}
