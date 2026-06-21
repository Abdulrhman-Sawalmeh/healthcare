import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { LocalPatientRecord, ReferralRecord } from "../types";

const statusOptions = [
  "",
  "REQUESTED",
  "AUTO_SELECTED",
  "PENDING_RECEIVING_MANAGER",
  "RECEIVING_MANAGER_ACCEPTED",
  "RECEIVING_MANAGER_REJECTED",
  "ASSIGNED_TO_DOCTOR",
  "VISIT_CREATED",
  "COMPLETED",
  "NO_CANDIDATE_REJECTED"
];

function referralDetails(referral: ReferralRecord) {
  return [
    referral.selectedCenterReason,
    referral.managerDecisionReason ? `قرار المدير: ${referral.managerDecisionReason}` : null,
    referral.rejectionReason ? `سبب الرفض: ${referral.rejectionReason}` : null,
    referral.matchingScore != null ? `درجة المطابقة: ${referral.matchingScore}` : null,
    referral.estimatedWaitTimeMinutes != null ? `انتظار متوقع: ${referral.estimatedWaitTimeMinutes} دقيقة` : null,
    referral.assignedDoctor ? `الطبيب المسند: ${referral.assignedDoctor.fullName}` : null,
    referral.createdVisitId ? `زيارة رقم: ${referral.createdVisitId}` : null
  ].filter(Boolean);
}

export function ReferralsPage() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({
    localPatientId: "",
    requiredSpecialty: "أمراض القلب",
    priority: "URGENT",
    reason: "",
    requiresOr: false,
    requiredMedicineIds: "",
    preferredRegion: "",
    maxDistanceKm: "120",
    notesFromSender: ""
  });

  const statusFilter = searchParams.get("status") ?? "";

  async function loadData() {
    const referralPath = user?.workspace === "central" ? "/central/referrals" : "/center/referrals";
    const requests = [apiRequest<ReferralRecord[]>(referralPath)];

    if (user?.workspace === "center") {
      requests.push(apiRequest<LocalPatientRecord[]>("/center/patients") as unknown as Promise<ReferralRecord[]>);
    }

    const [referralsPayload, patientsPayload] = await Promise.all(requests);
    setReferrals(referralsPayload);
    if (user?.workspace === "center") {
      setPatients((patientsPayload as unknown as LocalPatientRecord[]) ?? []);
    }
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiRequest("/center/referrals/request", {
        method: "POST",
        body: JSON.stringify({
          localPatientId: Number(form.localPatientId),
          requiredSpecialty: form.requiredSpecialty,
          priority: form.priority,
          reason: form.reason,
          requiresOr: form.requiresOr,
          requiredMedicineIds: form.requiredMedicineIds
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .map(Number),
          preferredRegion: form.preferredRegion || undefined,
          maxDistanceKm: Number(form.maxDistanceKm),
          notesFromSender: form.notesFromSender || undefined,
          processNow: true
        })
      });

      setForm({
        localPatientId: "",
        requiredSpecialty: "أمراض القلب",
        priority: "URGENT",
        reason: "",
        requiresOr: false,
        requiredMedicineIds: "",
        preferredRegion: "",
        maxDistanceKm: "120",
        notesFromSender: ""
      });

      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الإحالة.");
    }
  }

  const filteredReferrals = useMemo(() => {
    if (!statusFilter) {
      return referrals;
    }

    return referrals.filter((referral) => referral.status === statusFilter);
  }, [referrals, statusFilter]);

  const canRequest = user?.workspace === "center" && (user.role === "CENTER_MANAGER" || user.role === "DOCTOR");

  return (
    <div className="page-stack">
      {canRequest ? (
        <SectionCard
          title="إنشاء إحالة ذكية"
          subtitle="يختار المحرك المركزي أفضل جهة استقبال بناءً على التخصص والمسافة والضغط التشغيلي ومدة الانتظار وتوفر غرفة العمليات والأدوية المطلوبة."
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>المريض</span>
              <select
                value={form.localPatientId}
                onChange={(event) => setForm((current) => ({ ...current, localPatientId: event.target.value }))}
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
              <span>التخصص المطلوب</span>
              <input
                value={form.requiredSpecialty}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requiredSpecialty: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>درجة الاستعجال</span>
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              >
                <option value="NORMAL">{toArabicLabel("NORMAL")}</option>
                <option value="URGENT">{toArabicLabel("URGENT")}</option>
                <option value="EMERGENCY">{toArabicLabel("EMERGENCY")}</option>
              </select>
            </label>
            <label className="field">
              <span>أقصى مسافة بالكيلومتر</span>
              <input
                value={form.maxDistanceKm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, maxDistanceKm: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>المنطقة المفضلة</span>
              <input
                value={form.preferredRegion}
                onChange={(event) =>
                  setForm((current) => ({ ...current, preferredRegion: event.target.value }))
                }
              />
            </label>
            <label className="field checkbox-field">
              <input
                checked={form.requiresOr}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requiresOr: event.target.checked }))
                }
                type="checkbox"
              />
              <span>تتطلب غرفة عمليات</span>
            </label>
            <label className="field field-span-2">
              <span>سبب الإحالة</span>
              <textarea
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
            <label className="field field-span-2">
              <span>معرفات الأدوية المطلوبة</span>
              <input
                value={form.requiredMedicineIds}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requiredMedicineIds: event.target.value }))
                }
                placeholder="مثال: 1,2"
              />
            </label>
            <label className="field field-span-2">
              <span>ملاحظات سريرية إضافية</span>
              <textarea
                value={form.notesFromSender}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notesFromSender: event.target.value }))
                }
              />
            </label>
            <button className="primary-button field-span-2" type="submit">
              إرسال طلب الإحالة
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={user?.workspace === "central" ? "متابعة الإحالات على مستوى الشبكة" : "سجل الإحالات في المركز"}
        subtitle="عرض الإحالات المقبولة والمعلقة والمرفوضة والمكتملة ضمن الشبكة الصحية."
      >
        {error ? <div className="error-banner">{error}</div> : null}

        {user?.workspace === "central" ? (
          <div className="chip-row">
            {statusOptions.map((status) => (
              <button
                className={statusFilter === status ? "primary-button" : "ghost-button"}
                key={status || "ALL"}
                onClick={() => (status ? setSearchParams({ status }) : setSearchParams({}))}
                type="button"
              >
                {status ? toArabicLabel(status) : "الكل"}
              </button>
            ))}
          </div>
        ) : null}

        {statusFilter ? (
          <div className="filter-summary">
            <div>
              <strong>تصفية حسب الحالة</strong>
              <p className="muted">يعرض الجدول الإحالات التي حالتها {toArabicLabel(statusFilter)} فقط.</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
              عرض كل الإحالات
            </button>
          </div>
        ) : null}

        {filteredReferrals.length === 0 ? (
          <div className="empty-state compact">لا توجد إحالات تطابق التصفية الحالية.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>المسار</th>
                  <th>الاحتياج السريري</th>
                  <th>الحالة والتفاصيل</th>
                  <th>التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {filteredReferrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <strong>{referral.patientName ?? "مريض"}</strong>
                      <span>{referral.patientUnifiedId ?? "سجل إحالة محلي"}</span>
                    </td>
                    <td>
                      <strong>{referral.fromCenter}</strong>
                      <span>{referral.toCenter}</span>
                    </td>
                    <td>
                      <strong>{referral.requiredSpecialty}</strong>
                      <span>{referral.reason}</span>
                      {referral.notesFromSender ? <span>{referral.notesFromSender}</span> : null}
                    </td>
                    <td>
                      <StatusBadge status={referral.status} />
                      {referralDetails(referral).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </td>
                    <td>
                      <strong>{formatDateTime(referral.requestedAt)}</strong>
                      {referral.decisionAt ? <span>قرار: {formatDateTime(referral.decisionAt)}</span> : null}
                      {referral.assignedAt ? <span>إسناد: {formatDateTime(referral.assignedAt)}</span> : null}
                      {referral.visitCreatedAt ? <span>زيارة: {formatDateTime(referral.visitCreatedAt)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
