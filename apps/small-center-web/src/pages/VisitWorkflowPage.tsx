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
  invoice?: { amount: number; paidAmount: number } | null;
  prescriptions: Array<{ id: number; medicineName: string; dosage: string; quantity: number }>;
};

type IntakeOptions = {
  patients: Array<{ id: number; fullName: string; phone: string }>;
  doctors: Array<{ id: number; fullName: string }>;
};

type Catalogs = {
  medicines: Array<{ id: number; medicineName: string; quantity: number; unit: string; sellingPrice: number }>;
};

const statusLabels: Record<string, string> = {
  WAITING_DOCTOR: "بانتظار الطبيب",
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
  UPLOADED: "تم الرفع",
  FAILED: "فشل الرفع"
};

function optionalNumber(value: FormDataEntryValue | null) {
  return value ? Number(value) : undefined;
}

export function VisitWorkflowPage() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<WorkflowVisit[]>([]);
  const [options, setOptions] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [catalogs, setCatalogs] = useState<Catalogs>({ medicines: [] });
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canIntake = user?.role === "CENTER_MANAGER" || user?.role === "RECEPTIONIST";
  const canAssess = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";

  const loadVisits = useCallback(async () => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    setVisits(await apiRequest<WorkflowVisit[]>(`/center/visit-workflow${query}`));
  }, [status]);

  const loadPage = useCallback(async () => {
    try {
      setError("");
      const requests: Promise<unknown>[] = [
        loadVisits(),
        apiRequest<IntakeOptions>("/center/visit-workflow/intake-options").then(setOptions)
      ];
      if (canAssess) requests.push(apiRequest<Catalogs>("/center/visit-workflow/catalogs").then(setCatalogs));
      await Promise.all(requests);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات الزيارة.");
    }
  }, [canAssess, loadVisits]);

  useEffect(() => { void loadPage(); }, [loadPage]);

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
      setMessage("تم تسجيل الزيارة وتحويلها إلى الطبيب.");
      await loadVisits();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الزيارة.");
    } finally {
      setBusyId(null);
    }
  }

  function submitAssessment(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const medicineId = optionalNumber(form.get("medicineId"));
    const prescriptions = medicineId ? [{
      medicineId,
      dosage: String(form.get("dosage") || ""),
      duration: String(form.get("duration") || ""),
      quantity: Number(form.get("quantity") || 1),
      instructions: form.get("instructions") || undefined
    }] : [];

    void runAction(visitId, () => apiRequest(`/center/visit-workflow/${visitId}/doctor`, {
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
    }), "تم حفظ تقييم الطبيب.");
  }

  return (
    <div className="page-stack">
      <header className="page-panel section-header">
        <div>
          <p className="eyebrow">سير عمل الأدوار داخل المركز</p>
          <h1>ملفات الزيارة والمتابعة</h1>
          <p className="muted">الاستقبال يسجل الزيارة، والطبيب يكمل الملف، والمدير يتابع الفاتورة والرفع.</p>
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
        <SectionCard title="تسجيل زيارة جديدة" subtitle="إدخال المريض والطبيب وأولوية الحالة">
          <form className="form-grid" onSubmit={submitVisit}>
            <label className="field">
              <span>المريض</span>
              <select name="patientId" required defaultValue="">
                <option value="" disabled>اختر المريض</option>
                {options.patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName} - {patient.phone}</option>)}
              </select>
            </label>
            <label className="field">
              <span>الطبيب</span>
              <select name="doctorId" defaultValue="">
                <option value="">يحدد لاحقاً</option>
                {options.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
              </select>
            </label>
            <label className="field"><span>تاريخ الزيارة</span><input name="visitDate" type="date" required /></label>
            <label className="field"><span>وقت الزيارة</span><input name="visitTime" type="time" /></label>
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
            <label className="field"><span>الأعراض الأولية</span><textarea name="symptoms" /></label>
            <label className="field"><span>ملاحظات الاستقبال</span><textarea name="notes" /></label>
            <button className="primary-button" disabled={busyId === 0} type="submit">تسجيل الزيارة</button>
          </form>
        </SectionCard>
      ) : null}

      {visits.map((visit) => (
        <SectionCard key={visit.id} title={`${visit.patient.fullName} - زيارة رقم ${visit.id}`} subtitle={`${visit.patient.phone} | الطبيب: ${visit.doctor?.fullName ?? "لم يحدد بعد"}`}>
          <div className="section-header">
            <div>
              <strong>{statusLabels[visit.workflowStatus] ?? visit.workflowStatus}</strong>
              <p className="muted">التشخيص: {visit.diagnosis || "بانتظار الطبيب"}</p>
              <p className="muted">حالة الرفع: {uploadLabels[visit.uploadStatus] ?? visit.uploadStatus}</p>
            </div>
            <span className={`status-badge ${visit.priority === "EMERGENCY" ? "danger" : visit.priority === "URGENT" ? "warning" : "neutral"}`}>{priorityLabels[visit.priority]}</span>
          </div>

          {visit.uploadError ? <div className="error-banner">{visit.uploadError}</div> : null}
          {visit.invoice ? <div className="inline-note">قيمة الفاتورة: {visit.invoice.amount.toFixed(2)} شيكل</div> : null}

          {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(visit.workflowStatus) ? (
            <form className="form-grid" onSubmit={(event) => submitAssessment(event, visit.id)}>
              <label className="field field-span-2"><span>التشخيص</span><input name="diagnosis" required minLength={3} /></label>
              <label className="field"><span>الأعراض</span><textarea name="symptoms" /></label>
              <label className="field"><span>ملاحظات الطبيب</span><textarea name="notes" /></label>
              <label className="field"><span>ضغط الدم</span><input name="bloodPressure" placeholder="120/80" /></label>
              <label className="field"><span>درجة الحرارة</span><input name="temperature" type="number" step="0.1" /></label>
              <label className="field"><span>معدل النبض</span><input name="heartRate" type="number" /></label>
              <label className="field">
                <span>دواء من المخزون</span>
                <select name="medicineId" defaultValue="">
                  <option value="">دون وصفة دوائية</option>
                  {catalogs.medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.medicineName} - المتاح {medicine.quantity} {medicine.unit}</option>)}
                </select>
              </label>
              <label className="field"><span>الجرعة</span><input name="dosage" placeholder="مثال: حبة مرتين يومياً" /></label>
              <label className="field"><span>المدة</span><input name="duration" placeholder="مثال: خمسة أيام" /></label>
              <label className="field"><span>الكمية</span><input name="quantity" type="number" min="1" defaultValue="1" /></label>
              <label className="field"><span>تعليمات الدواء</span><input name="instructions" /></label>
              <button className="primary-button" disabled={busyId === visit.id} type="submit">حفظ تقييم الطبيب</button>
            </form>
          ) : null}

          {visit.prescriptions.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>الدواء</th><th>الجرعة</th><th>الكمية</th></tr></thead>
                <tbody>{visit.prescriptions.map((item) => <tr key={item.id}><td>{item.medicineName}</td><td>{item.dosage}</td><td>{item.quantity}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}

          {canAssess && visit.workflowStatus === "READY_TO_UPLOAD" && visit.uploadStatus === "NOT_READY" ? (
            <button className="primary-button" disabled={busyId === visit.id} type="button" onClick={() =>
              void runAction(visit.id, () => apiRequest(`/center/visit-workflow/${visit.id}/complete`, { method: "POST" }), "تم إنشاء الفاتورة وتجهيز الملف.")
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
