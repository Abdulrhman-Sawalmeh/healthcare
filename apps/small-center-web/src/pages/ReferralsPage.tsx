import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { ClinicalWorkflowScene3D } from "../components/ClinicalWorkflowScene3D";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { LocalPatientRecord, ReferralRecord } from "../types";

function getDisplayName(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = record.centerName ?? record.name ?? record.fullName;
    return typeof name === "string" ? name : fallback;
  }

  return fallback;
}

function getStringField(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function normalizeReferral(referral: unknown): ReferralRecord {
  const record = referral && typeof referral === "object" ? (referral as Record<string, unknown>) : {};
  const patient = record.patient && typeof record.patient === "object" ? (record.patient as Record<string, unknown>) : {};

  return {
    id: Number(record.id ?? 0),
    patientName: getStringField(record, "patientName", getDisplayName(patient, "مريض")),
    patientUnifiedId: getStringField(record, "patientUnifiedId", getStringField(patient, "unifiedId", "")),
    fromCenter: getDisplayName(record.fromCenter, "مركز الإرسال"),
    toCenter: getDisplayName(record.toCenter, "بانتظار اختيار مركز الاستقبال"),
    requiredSpecialty: getStringField(record, "requiredSpecialty", "تخصص غير محدد"),
    priority: getStringField(record, "priority", "NORMAL"),
    status: getStringField(record, "status", "PENDING"),
    reason: getStringField(record, "reason", "لا يوجد سبب موثق."),
    selectedCenterReason: getStringField(record, "selectedCenterReason") || null,
    rejectionReason: getStringField(record, "rejectionReason") || null,
    estimatedWaitTimeMinutes:
      typeof record.estimatedWaitTimeMinutes === "number" ? record.estimatedWaitTimeMinutes : null,
    requestedAt: getStringField(record, "requestedAt", new Date().toISOString()),
    respondedAt: getStringField(record, "respondedAt") || null,
    notesFromSender: getStringField(record, "notesFromSender") || null,
    notesFromReceiver: getStringField(record, "notesFromReceiver") || null
  };
}

export function ReferralsPage() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedReferralId, setSelectedReferralId] = useState<number | null>(null);
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

  async function loadData() {
    const referralPath = user?.workspace === "central" ? "/central/referrals" : "/center/referrals";

    const referralsPayload = await apiRequest<unknown[]>(referralPath);
    setReferrals(referralsPayload.map(normalizeReferral));

    if (user?.workspace === "center") {
      setPatients(await apiRequest<LocalPatientRecord[]>("/center/patients"));
    }
  }

  useEffect(() => {
    loadData()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [user]);

  const filteredReferrals = useMemo(() => {
    if (!statusFilter) {
      return referrals;
    }

    return referrals.filter((referral) => referral.status === statusFilter);
  }, [referrals, statusFilter]);

  const referralStats = useMemo(
    () => ({
      total: referrals.length,
      pending: referrals.filter((referral) => referral.status === "PENDING").length,
      accepted: referrals.filter((referral) => referral.status === "ACCEPTED").length,
      rejected: referrals.filter((referral) => referral.status === "REJECTED").length,
      completed: referrals.filter((referral) => referral.status === "COMPLETED").length
    }),
    [referrals]
  );

  useEffect(() => {
    if (filteredReferrals.length === 0) {
      setSelectedReferralId(null);
      return;
    }

    setSelectedReferralId((current) =>
      current && filteredReferrals.some((referral) => referral.id === current) ? current : filteredReferrals[0].id
    );
  }, [filteredReferrals]);

  const selectedReferral = useMemo(
    () => filteredReferrals.find((referral) => referral.id === selectedReferralId) ?? null,
    [filteredReferrals, selectedReferralId]
  );

  const statusFilters = [
    { value: "", label: "الكل", count: referralStats.total },
    { value: "PENDING", label: toArabicLabel("PENDING"), count: referralStats.pending },
    { value: "ACCEPTED", label: toArabicLabel("ACCEPTED"), count: referralStats.accepted },
    { value: "REJECTED", label: toArabicLabel("REJECTED"), count: referralStats.rejected },
    { value: "COMPLETED", label: toArabicLabel("COMPLETED"), count: referralStats.completed }
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    setError("");

    if (!form.localPatientId || !form.requiredSpecialty.trim() || form.reason.trim().length < 5) {
      setError("اختر المريض واكتب التخصص وسبب إحالة واضح قبل الإرسال.");
      return;
    }

    const maxDistanceKm = form.maxDistanceKm.trim() ? Number(form.maxDistanceKm) : undefined;

    if (maxDistanceKm !== undefined && (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0)) {
      setError("أدخل أقصى مسافة كرقم موجب بالكيلومتر.");
      return;
    }

    const requiredMedicineIds = form.requiredMedicineIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number);

    if (requiredMedicineIds.some((value) => !Number.isInteger(value) || value <= 0)) {
      setError("معرفات الأدوية يجب أن تكون أرقامًا صحيحة مفصولة بفواصل، مثل 1,2.");
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest("/center/referrals/request", {
        method: "POST",
        body: JSON.stringify({
          localPatientId: Number(form.localPatientId),
          requiredSpecialty: form.requiredSpecialty.trim(),
          priority: form.priority,
          reason: form.reason.trim(),
          requiresOr: form.requiresOr,
          requiredMedicineIds,
          preferredRegion: form.preferredRegion.trim() || undefined,
          maxDistanceKm,
          notesFromSender: form.notesFromSender.trim() || undefined,
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
      setSuccessMessage("تم إرسال طلب الإحالة ومعالجة التوجيه الأولي بنجاح.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الإحالة.");
      setSuccessMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  const canRequest = user?.workspace === "center" && (user.role === "CENTER_MANAGER" || user.role === "DOCTOR");

  return (
    <div className="page-stack referrals-page">
      {successMessage ? <div className="success-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="hero-strip referral-hero-shell">
        <div className="hero-copy-block">
          <p className="eyebrow">Referral Command Center</p>
          <h1>إدارة الإحالات الذكية</h1>
          <p className="muted">
            فرز الإحالات حسب الحالة، اختيار أفضل جهة استقبال، ومتابعة سبب القرار من لحظة الطلب حتى اكتمال المسار.
          </p>
        </div>
        <div className="workflow-scene-shell">
          <ClinicalWorkflowScene3D variant="referrals" />
          <div className="scene-stat-row" aria-hidden="true">
            <span>{referralStats.pending} معلقة</span>
            <span>{referralStats.accepted} مقبولة</span>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="eyebrow">كل الإحالات</span>
          <h3>{referralStats.total}</h3>
          <p className="muted">طلبات صادرة أو واردة مرتبطة بهذا المركز.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">بانتظار التوجيه</span>
          <h3>{referralStats.pending}</h3>
          <p className="muted">تحتاج متابعة أو معالجة مركزية إضافية.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">مسار مقبول</span>
          <h3>{referralStats.accepted}</h3>
          <p className="muted">تم اختيار مركز استقبال مناسب لها.</p>
        </article>
      </section>

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
                required
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
                required
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
                inputMode="numeric"
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
                required
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
            <button className="primary-button field-span-2" disabled={submitting} type="submit">
              {submitting ? "جارٍ إرسال الإحالة..." : "إرسال طلب الإحالة"}
            </button>
          </form>
        </SectionCard>
      ) : null}

      <section className="split-grid referral-workbench">
        <SectionCard title="فرز سريع" subtitle="غيّر الحالة لمراجعة الإحالات ضمن نفس التدفق.">
          <div className="status-filter-grid">
            {statusFilters.map((filter) => (
              <button
                className={`status-filter-card ${statusFilter === filter.value ? "active" : ""}`.trim()}
                key={filter.value || "all"}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
              >
                <span>{filter.label}</span>
                <strong>{filter.count}</strong>
              </button>
            ))}
          </div>
          <div className="stack-list compact">
            {filteredReferrals.slice(0, 5).map((referral) => (
              <button
                className={`referral-list-card ${selectedReferralId === referral.id ? "active" : ""}`.trim()}
                key={referral.id}
                type="button"
                onClick={() => setSelectedReferralId(referral.id)}
              >
                <span>{referral.patientName ?? "مريض"}</span>
                <strong>{referral.requiredSpecialty}</strong>
                <small>{formatDateTime(referral.requestedAt)}</small>
              </button>
            ))}
            {loading ? <div className="empty-state compact">جارٍ تحميل الإحالات...</div> : null}
            {!loading && filteredReferrals.length === 0 ? (
              <div className="empty-state compact">لا توجد إحالات ضمن هذا التصنيف.</div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="تفاصيل المسار" subtitle="سبب القرار والمركز المستقبِل والملاحظات السريرية.">
          {selectedReferral ? (
            <article className="referral-detail-card">
              <div className="section-header">
                <div>
                  <p className="eyebrow">{selectedReferral.patientUnifiedId ?? "سجل محلي"}</p>
                  <h3>{selectedReferral.patientName ?? "مريض"}</h3>
                </div>
                <StatusBadge status={selectedReferral.status} />
              </div>
              <div className="referral-route-line">
                <span>{selectedReferral.fromCenter}</span>
                <strong>{selectedReferral.toCenter}</strong>
              </div>
              <p>{selectedReferral.reason}</p>
              <div className="tile-stats">
                <span>{selectedReferral.requiredSpecialty}</span>
                <span>{toArabicLabel(selectedReferral.priority)}</span>
                {selectedReferral.estimatedWaitTimeMinutes != null ? (
                  <span>{selectedReferral.estimatedWaitTimeMinutes} دقيقة انتظار</span>
                ) : null}
              </div>
              {selectedReferral.selectedCenterReason ? (
                <p className="muted">{selectedReferral.selectedCenterReason}</p>
              ) : null}
              {selectedReferral.rejectionReason ? <p className="muted">{selectedReferral.rejectionReason}</p> : null}
              {selectedReferral.notesFromSender ? <p className="muted">{selectedReferral.notesFromSender}</p> : null}
            </article>
          ) : (
            <div className="empty-state compact">اختر إحالة لعرض تفاصيلها.</div>
          )}
        </SectionCard>
      </section>

      <SectionCard
        title={user?.workspace === "central" ? "متابعة الإحالات على مستوى الشبكة" : "سجل الإحالات في المركز"}
        subtitle="عرض الإحالات المقبولة والمعلقة والمرفوضة والمكتملة ضمن الشبكة الصحية."
      >
        {filteredReferrals.length === 0 && !loading ? (
          <div className="empty-state compact">لا توجد إحالات لعرضها.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>المسار</th>
                  <th>الاحتياج السريري</th>
                  <th>الحالة</th>
                  <th>تاريخ الطلب</th>
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
                    </td>
                    <td>
                      <StatusBadge status={referral.status} />
                    </td>
                    <td>{formatDateTime(referral.requestedAt)}</td>
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
