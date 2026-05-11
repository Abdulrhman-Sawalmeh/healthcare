import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { toArabicLabel } from "../lib/arabic";
import { CenterWorkspaceData, LabBundle, LocalPatientRecord } from "../types";

const defaultRequestForm = {
  patientId: "",
  doctorId: "",
  testId: "",
  status: "PENDING",
  resultValue: ""
};

export function LabPage() {
  const { user } = useAuth();
  const [labData, setLabData] = useState<LabBundle | null>(null);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [workspace, setWorkspace] = useState<CenterWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [requestForm, setRequestForm] = useState(defaultRequestForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);

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

  function resetForm() {
    setRequestForm(defaultRequestForm);
    setEditingRequestId(null);
  }

  function startEditing(request: LabBundle["requests"][number]) {
    setEditingRequestId(request.id);
    setRequestForm({
      patientId: String(request.patientId),
      doctorId: String(request.doctorId),
      testId: String(request.testId),
      status: request.status,
      resultValue: request.resultValue ?? ""
    });
    setError("");
    setSuccessMessage("");
  }

  async function handleCreateOrUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingRequestId ? `/center/lab/requests/${editingRequestId}` : "/center/lab/requests";
    const method = editingRequestId ? "PUT" : "POST";

    try {
      setSubmitting(true);
      await apiRequest(path, {
        method,
        body: JSON.stringify({
          patientId: Number(requestForm.patientId),
          doctorId: Number(requestForm.doctorId || user?.id),
          testId: Number(requestForm.testId),
          status: requestForm.status,
          resultValue: requestForm.resultValue || undefined
        })
      });

      resetForm();
      await loadData();
      setError("");
      setSuccessMessage(editingRequestId ? "تم تحديث طلب المختبر." : "تم إرسال طلب المختبر.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ طلب المختبر.");
      setSuccessMessage("");
    } finally {
      setSubmitting(false);
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
      setSuccessMessage("تم اعتماد النتيجة المخبرية.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر استكمال الطلب المخبري.");
      setSuccessMessage("");
    }
  }

  async function handleDelete(requestId: number) {
    if (!window.confirm("هل تريد حذف طلب المختبر هذا؟")) {
      return;
    }

    try {
      setDeletingRequestId(requestId);
      await apiRequest(`/center/lab/requests/${requestId}`, {
        method: "DELETE"
      });
      if (editingRequestId === requestId) {
        resetForm();
      }
      await loadData();
      setError("");
      setSuccessMessage("تم حذف طلب المختبر.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف طلب المختبر.");
      setSuccessMessage("");
    } finally {
      setDeletingRequestId(null);
    }
  }

  const canCreate = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";
  const canComplete = user?.role === "CENTER_MANAGER" || user?.role === "LAB_TECH";

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}
      {successMessage ? <div className="empty-state compact">{successMessage}</div> : null}

      {canCreate || canComplete ? (
        <SectionCard
          title={editingRequestId ? "تعديل طلب مختبري" : "إنشاء طلب فحص مخبري"}
          subtitle={
            editingRequestId
              ? "يمكن تعديل الطلب المحلي وفق صلاحية الدور وحالة الطلب."
              : "يمكن للطبيب أو مدير المركز إرسال طلبات الفحوصات لتظهر مباشرة في واجهة فني المختبر."
          }
        >
          <form className="form-grid" onSubmit={handleCreateOrUpdate}>
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
                      {member.specialization ? `${member.fullName} - ${member.specialization}` : member.fullName}
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

            {editingRequestId ? (
              <>
                <label className="field">
                  <span>الحالة</span>
                  <select
                    value={requestForm.status}
                    onChange={(event) =>
                      setRequestForm((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    <option value="PENDING">{toArabicLabel("PENDING")}</option>
                    <option value="IN_PROGRESS">{toArabicLabel("IN_PROGRESS")}</option>
                    <option value="COMPLETED">{toArabicLabel("COMPLETED")}</option>
                    <option value="CANCELLED">{toArabicLabel("CANCELLED")}</option>
                  </select>
                </label>
                <label className="field field-span-2">
                  <span>نتيجة الفحص</span>
                  <textarea
                    value={requestForm.resultValue}
                    onChange={(event) =>
                      setRequestForm((current) => ({ ...current, resultValue: event.target.value }))
                    }
                    placeholder="أدخل النتيجة أو الملاحظات المخبرية عند الحاجة."
                  />
                </label>
              </>
            ) : null}

            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={submitting} type="submit">
                {submitting ? "جارٍ الحفظ..." : editingRequestId ? "حفظ التعديلات" : "إرسال الطلب"}
              </button>
              {editingRequestId ? (
                <button className="ghost-button" onClick={resetForm} type="button">
                  إلغاء التعديل
                </button>
              ) : null}
            </div>
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

                <div className="button-row">
                  <button className="ghost-button" onClick={() => startEditing(request)} type="button">
                    تعديل
                  </button>
                  {request.status !== "COMPLETED" ? (
                    <button
                      className="danger-button"
                      disabled={deletingRequestId === request.id}
                      onClick={() => void handleDelete(request.id)}
                      type="button"
                    >
                      {deletingRequestId === request.id ? "جارٍ الحذف..." : "حذف"}
                    </button>
                  ) : null}
                  {canComplete && request.status !== "COMPLETED" ? (
                    <button className="ghost-button" onClick={() => void markCompleted(request.id)} type="button">
                      اعتماد النتيجة
                    </button>
                  ) : null}
                </div>

                {request.resultValue ? (
                  <p className="muted">
                    {toArabicLabel(request.status)}: {request.resultValue}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
