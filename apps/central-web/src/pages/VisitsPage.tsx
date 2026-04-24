import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { CenterWorkspaceData, LocalPatientRecord, VisitRecord } from "../types";

export function VisitsPage() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [workspace, setWorkspace] = useState<CenterWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patientId: "",
    doctorId: "",
    visitDate: "",
    visitTime: "",
    visitType: "CONSULTATION",
    symptoms: "",
    bloodPressure: "",
    temperature: "",
    heartRate: "",
    diagnosis: "",
    notes: "",
    prescriptionMedicine: "",
    prescriptionDosage: "",
    prescriptionDuration: "",
    prescriptionInstructions: ""
  });

  async function loadPage() {
    const [visitsPayload, patientsPayload, workspacePayload] = await Promise.all([
      apiRequest<VisitRecord[]>("/center/visits"),
      apiRequest<LocalPatientRecord[]>("/center/patients"),
      apiRequest<CenterWorkspaceData>("/center/dashboard")
    ]);

    setVisits(visitsPayload);
    setPatients(patientsPayload);
    setWorkspace(workspacePayload);
  }

  useEffect(() => {
    loadPage().catch((cause: Error) => setError(cause.message));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prescriptions =
      form.prescriptionMedicine && form.prescriptionDosage && form.prescriptionDuration
        ? [
            {
              medicineName: form.prescriptionMedicine,
              dosage: form.prescriptionDosage,
              duration: form.prescriptionDuration,
              instructions: form.prescriptionInstructions || undefined
            }
          ]
        : [];

    try {
      await apiRequest("/center/visits", {
        method: "POST",
        body: JSON.stringify({
          patientId: Number(form.patientId),
          doctorId: form.doctorId ? Number(form.doctorId) : undefined,
          visitDate: form.visitDate,
          visitTime: form.visitTime || undefined,
          visitType: form.visitType,
          symptoms: form.symptoms || undefined,
          bloodPressure: form.bloodPressure || undefined,
          temperature: form.temperature ? Number(form.temperature) : undefined,
          heartRate: form.heartRate ? Number(form.heartRate) : undefined,
          diagnosis: form.diagnosis,
          notes: form.notes || undefined,
          prescriptions
        })
      });

      setForm({
        patientId: "",
        doctorId: "",
        visitDate: "",
        visitTime: "",
        visitType: "CONSULTATION",
        symptoms: "",
        bloodPressure: "",
        temperature: "",
        heartRate: "",
        diagnosis: "",
        notes: "",
        prescriptionMedicine: "",
        prescriptionDosage: "",
        prescriptionDuration: "",
        prescriptionInstructions: ""
      });
      await loadPage();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الزيارة.");
    }
  }

  const canCreate = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR" || user?.role === "NURSE";

  return (
    <div className="page-stack">
      {canCreate ? (
        <SectionCard
          title="تسجيل زيارة محلية"
          subtitle="تُحفظ الزيارة أولًا داخل المركز ثم تُزامن مع النظام المركزي عند معالجة الطوابير."
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>المريض</span>
              <select
                value={form.patientId}
                onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}
              >
                <option value="">اختر المريض</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>المعالج</span>
              <select
                value={form.doctorId}
                onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))}
              >
                <option value="">استخدم المستخدم الحالي</option>
                {workspace?.team
                  .filter((member) => member.role === "DOCTOR" || member.role === "NURSE")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>تاريخ ووقت الزيارة</span>
              <input
                type="datetime-local"
                value={form.visitDate}
                onChange={(event) => setForm((current) => ({ ...current, visitDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الوقت المختصر</span>
              <input
                value={form.visitTime}
                onChange={(event) => setForm((current) => ({ ...current, visitTime: event.target.value }))}
                placeholder="11:20"
              />
            </label>
            <label className="field">
              <span>نوع الزيارة</span>
              <select
                value={form.visitType}
                onChange={(event) => setForm((current) => ({ ...current, visitType: event.target.value }))}
              >
                <option value="CONSULTATION">{toArabicLabel("CONSULTATION")}</option>
                <option value="EMERGENCY">{toArabicLabel("EMERGENCY")}</option>
                <option value="FOLLOW_UP">{toArabicLabel("FOLLOW_UP")}</option>
                <option value="LAB">{toArabicLabel("LAB")}</option>
              </select>
            </label>
            <label className="field">
              <span>الضغط الشرياني</span>
              <input
                value={form.bloodPressure}
                onChange={(event) =>
                  setForm((current) => ({ ...current, bloodPressure: event.target.value }))
                }
                placeholder="120/80"
              />
            </label>
            <label className="field field-span-2">
              <span>الأعراض</span>
              <textarea
                value={form.symptoms}
                onChange={(event) => setForm((current) => ({ ...current, symptoms: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>درجة الحرارة</span>
              <input
                value={form.temperature}
                onChange={(event) =>
                  setForm((current) => ({ ...current, temperature: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>معدل النبض</span>
              <input
                value={form.heartRate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, heartRate: event.target.value }))
                }
              />
            </label>
            <label className="field field-span-2">
              <span>التشخيص</span>
              <input
                value={form.diagnosis}
                onChange={(event) => setForm((current) => ({ ...current, diagnosis: event.target.value }))}
              />
            </label>
            <label className="field field-span-2">
              <span>الملاحظات السريرية</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الدواء الموصوف</span>
              <input
                value={form.prescriptionMedicine}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prescriptionMedicine: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>الجرعة</span>
              <input
                value={form.prescriptionDosage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prescriptionDosage: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>المدة العلاجية</span>
              <input
                value={form.prescriptionDuration}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prescriptionDuration: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>تعليمات الاستخدام</span>
              <input
                value={form.prescriptionInstructions}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prescriptionInstructions: event.target.value
                  }))
                }
              />
            </label>
            <button className="primary-button field-span-2" type="submit">
              حفظ الزيارة
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="سجل الزيارات المحلي" subtitle="تدفق الزيارات التشغيلية داخل المركز الصحي.">
        {error ? <div className="error-banner">{error}</div> : null}
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>المريض</th>
                <th>المعالج</th>
                <th>التشخيص</th>
                <th>المزامنة</th>
                <th>التوقيت</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => (
                <tr key={visit.id}>
                  <td>
                    <strong>{visit.patientName}</strong>
                    <span>{toArabicLabel(visit.visitType)}</span>
                  </td>
                  <td>{visit.doctorName}</td>
                  <td>
                    <strong>{visit.diagnosis}</strong>
                    <span>{visit.prescriptionCount} وصفات دوائية</span>
                  </td>
                  <td>
                    <StatusBadge status={visit.syncState} />
                  </td>
                  <td>{formatDateTime(visit.visitDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
