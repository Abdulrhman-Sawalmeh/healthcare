import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { toArabicLabel } from "../lib/arabic";
import { CenterWorkspaceData, LabBundle, LocalPatientRecord } from "../types";

export function LabPage() {
  const { user } = useAuth();
  const [labData, setLabData] = useState<LabBundle | null>(null);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [workspace, setWorkspace] = useState<CenterWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [requestForm, setRequestForm] = useState({
    patientId: "",
    doctorId: "",
    testId: ""
  });

  async function loadData() {
    const [labPayload, patientsPayload, workspacePayload] = await Promise.all([
      apiRequest<LabBundle>("/center/lab"),
      apiRequest<LocalPatientRecord[]>("/center/patients"),
      apiRequest<CenterWorkspaceData>("/center/dashboard")
    ]);

    setLabData(labPayload);
    setPatients(patientsPayload);
    setWorkspace(workspacePayload);
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  async function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiRequest("/center/lab/requests", {
        method: "POST",
        body: JSON.stringify({
          patientId: Number(requestForm.patientId),
          doctorId: Number(requestForm.doctorId || user?.id),
          testId: Number(requestForm.testId)
        })
      });

      setRequestForm({
        patientId: "",
        doctorId: "",
        testId: ""
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الفحص.");
    }
  }

  async function markCompleted(requestId: number) {
    try {
      await apiRequest(`/center/lab/requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "COMPLETED",
          resultValue: "تم إدخال النتيجة من واجهة المختبر."
        })
      });

      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر استكمال الطلب المخبري.");
    }
  }

  const canCreate = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";
  const canComplete = user?.role === "CENTER_MANAGER" || user?.role === "LAB_TECH";

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}

      {canCreate ? (
        <SectionCard
          title="إنشاء طلب فحص مخبري"
          subtitle="يمكن للطبيب أو مدير المركز إرسال طلبات الفحوصات لتظهر مباشرة في واجهة فني المختبر."
        >
          <form className="form-grid" onSubmit={handleCreateRequest}>
            <label className="field">
              <span>المريض</span>
              <select
                value={requestForm.patientId}
                onChange={(event) =>
                  setRequestForm((current) => ({ ...current, patientId: event.target.value }))
                }
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
              <span>الطبيب الطالب</span>
              <select
                value={requestForm.doctorId}
                onChange={(event) =>
                  setRequestForm((current) => ({ ...current, doctorId: event.target.value }))
                }
              >
                <option value="">المستخدم الحالي</option>
                {workspace?.team
                  .filter((member) => member.role === "DOCTOR")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field field-span-2">
              <span>الفحص المطلوب</span>
              <select
                value={requestForm.testId}
                onChange={(event) =>
                  setRequestForm((current) => ({ ...current, testId: event.target.value }))
                }
              >
                <option value="">اختر الفحص</option>
                {labData?.catalog.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.testName} ({test.category})
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button field-span-2" type="submit">
              إرسال الطلب
            </button>
          </form>
        </SectionCard>
      ) : null}

      <div className="split-grid">
        <SectionCard title="دليل الفحوصات" subtitle="الفحوصات المخبرية المتاحة داخل المركز.">
          <div className="stack-list">
            {labData?.catalog.map((test) => (
              <article key={test.id} className="stack-item">
                <strong>{test.testName}</strong>
                <p className="muted">
                  {test.category} • {test.normalRange || "لا يوجد مجال مرجعي مسجل"}
                </p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="طلبات المختبر" subtitle="متابعة الطلبات الجارية وإكمال النتائج حسب الدور.">
          <div className="stack-list">
            {labData?.requests.map((request) => (
              <article className="stack-item" key={request.id}>
                <div className="info-row">
                  <div>
                    <strong>{request.testName}</strong>
                    <p className="muted">
                      {request.patientName} • {request.doctorName}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                {canComplete && request.status !== "COMPLETED" ? (
                  <button className="ghost-button" type="button" onClick={() => void markCompleted(request.id)}>
                    اعتماد النتيجة
                  </button>
                ) : null}
                {request.resultValue ? <p className="muted">{toArabicLabel(request.status)}: {request.resultValue}</p> : null}
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
