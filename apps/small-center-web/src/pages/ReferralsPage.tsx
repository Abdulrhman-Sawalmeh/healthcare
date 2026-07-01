import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { CenterDoctorsBundle, LocalPatientRecord, ReferralRecord } from "../types";

type ReferralView = "all" | "incoming" | "assigned";

const defaultForm = {
  localPatientId: "",
  requiredSpecialty: "أمراض القلب",
  priority: "URGENT",
  reason: "",
  requiresOr: false,
  requiredMedicineIds: "",
  preferredRegion: "",
  maxDistanceKm: "120",
  notesFromSender: ""
};

const fallbackSpecialties = ["أمراض القلب", "الباطنية", "الأطفال", "النساء والولادة", "العظام", "الأعصاب", "الجلدية"];

const centralStatusFilters = [
  "",
  "REQUESTED",
  "PENDING_RECEIVING_MANAGER",
  "RECEIVING_MANAGER_ACCEPTED",
  "RECEIVING_MANAGER_REJECTED",
  "ASSIGNED_TO_DOCTOR",
  "VISIT_CREATED",
  "COMPLETED",
  "NO_CANDIDATE_REJECTED"
];

const reviewStatuses = new Set(["AUTO_SELECTED", "PENDING_RECEIVING_MANAGER", "ACCEPTED"]);

export function ReferralsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [incoming, setIncoming] = useState<ReferralRecord[]>([]);
  const [assigned, setAssigned] = useState<ReferralRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [doctors, setDoctors] = useState<CenterDoctorsBundle | null>(null);
  const [activeView, setActiveView] = useState<ReferralView>(user?.role === "DOCTOR" ? "assigned" : "all");
  const [form, setForm] = useState(defaultForm);
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [doctorAssignments, setDoctorAssignments] = useState<Record<number, string>>({});
  const [visitDrafts, setVisitDrafts] = useState<Record<number, { symptoms: string; diagnosis: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const statusFilter = searchParams.get("status") ?? "";
  const viewParam = searchParams.get("view");
  const selectedReferralId = Number(searchParams.get("referralId") ?? 0);
  const canRequest = user?.workspace === "center" && (user.role === "CENTER_MANAGER" || user.role === "DOCTOR");
  const canReview = user?.workspace === "center" && user.role === "CENTER_MANAGER";
  const canSeeAssigned = user?.workspace === "center" && user.role === "DOCTOR";
  const specialtyOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...fallbackSpecialties,
          ...(doctors?.center.specialties ?? []),
          ...(doctors?.specialtyOptions ?? []),
          form.requiredSpecialty
        ].map((specialty) => specialty.trim()).filter(Boolean))
      ),
    [doctors, form.requiredSpecialty]
  );

  async function loadData() {
    setLoading(true);
    try {
      const nextReferrals = await apiRequest<ReferralRecord[]>(
        user?.workspace === "central" ? "/central/referrals" : "/center/referrals"
      );
      setReferrals(nextReferrals);

      if (user?.workspace !== "center") {
        setIncoming([]);
        setAssigned([]);
        setPatients([]);
        setDoctors(null);
        return;
      }

      const requests: Array<Promise<void>> = [];
      if (canRequest) {
        requests.push(apiRequest<LocalPatientRecord[]>("/center/patients").then(setPatients));
      }
      if (canReview) {
        requests.push(apiRequest<ReferralRecord[]>("/center/referrals/incoming").then(setIncoming));
        requests.push(apiRequest<CenterDoctorsBundle>("/center/doctors").then(setDoctors));
      }
      if (canSeeAssigned) {
        requests.push(apiRequest<ReferralRecord[]>("/center/referrals/assigned-to-me").then(setAssigned));
      }
      await Promise.all(requests);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, [user?.workspace, user?.role]);

  useEffect(() => {
    if (viewParam === "incoming" && canReview) {
      setActiveView("incoming");
    } else if (viewParam === "assigned" && canSeeAssigned) {
      setActiveView("assigned");
    } else if (!viewParam && canSeeAssigned) {
      setActiveView("assigned");
    }
  }, [canReview, canSeeAssigned, viewParam]);

  useEffect(() => {
    if (selectedReferralId > 0 || viewParam !== "incoming" || incoming.length !== 1) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.set("referralId", String(incoming[0].id));
    setSearchParams(params);
  }, [incoming, searchParams, selectedReferralId, setSearchParams, viewParam]);

  const visibleReferrals = useMemo(() => {
    const source = activeView === "incoming" ? incoming : activeView === "assigned" ? assigned : referrals;
    return statusFilter ? source.filter((referral) => referral.status === statusFilter) : source;
  }, [activeView, assigned, incoming, referrals, statusFilter]);

  const selectedReferral = useMemo(
    () => [...incoming, ...assigned, ...referrals].find((referral) => referral.id === selectedReferralId) ?? null,
    [assigned, incoming, referrals, selectedReferralId]
  );

  function openReferralDetails(referral: ReferralRecord) {
    const params = new URLSearchParams(searchParams);
    params.set("referralId", String(referral.id));

    if (activeView !== "all") {
      params.set("view", activeView);
    } else {
      params.delete("view");
    }

    setSearchParams(params);
  }

  function closeReferralDetails() {
    const params = new URLSearchParams(searchParams);
    params.delete("referralId");
    setSearchParams(params);
  }

  async function afterAction(success: string) {
    await loadData();
    setError("");
    setMessage(success);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const maxDistanceKm = Number(form.maxDistanceKm);
    if (!form.localPatientId) {
      setError("اختر المريض قبل إرسال طلب الإحالة.");
      return;
    }

    if (!form.requiredSpecialty.trim()) {
      setError("اختر التخصص المطلوب للإحالة.");
      return;
    }

    if (!form.reason.trim()) {
      setError("اكتب سبب الإحالة السريري قبل الإرسال.");
      return;
    }

    if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) {
      setError("أدخل أقصى مسافة بالكيلومتر كرقم صحيح أكبر من صفر.");
      return;
    }

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
          maxDistanceKm,
          notesFromSender: form.notesFromSender || undefined,
          processNow: true
        })
      });
      setForm(defaultForm);
      await afterAction("تم إرسال طلب الإحالة إلى المحرك المركزي.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الإحالة.");
    }
  }

  function run(referral: ReferralRecord, action: () => Promise<unknown>, success: string) {
    void (async () => {
      try {
        setBusyId(referral.id);
        await action();
        await afterAction(success);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.");
      } finally {
        setBusyId(null);
      }
    })();
  }

  function accept(referral: ReferralRecord) {
    run(
      referral,
      () => apiRequest(`/center/referrals/${referral.id}/manager-accept`, { method: "POST" }),
      "تم قبول الإحالة ويمكن إسنادها لطبيب."
    );
  }

  function reject(referral: ReferralRecord) {
    const reason = rejectReasons[referral.id]?.trim();
    if (!reason) {
      setError("سبب الرفض مطلوب.");
      return;
    }
    run(
      referral,
      () =>
        apiRequest(`/center/referrals/${referral.id}/manager-reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),
      "تم رفض الإحالة وإبلاغ المركز المُرسل."
    );
  }

  function assignDoctor(referral: ReferralRecord) {
    const doctorId = doctorAssignments[referral.id];
    if (!doctorId) {
      setError("اختر الطبيب قبل الإسناد.");
      return;
    }
    run(
      referral,
      () =>
        apiRequest(`/center/referrals/${referral.id}/assign-doctor`, {
          method: "POST",
          body: JSON.stringify({ doctorId: Number(doctorId) })
        }),
      "تم إسناد الإحالة للطبيب."
    );
  }

  function startVisit(referral: ReferralRecord) {
    const draft = visitDrafts[referral.id] ?? { symptoms: "", diagnosis: "" };
    run(
      referral,
      async () => {
        const payload = await apiRequest<{ visitId: number }>(`/center/referrals/${referral.id}/start-visit`, {
          method: "POST",
          body: JSON.stringify({
            symptoms: draft.symptoms || undefined,
            diagnosis: draft.diagnosis || undefined,
            visitType: "CONSULTATION"
          })
        });
        navigate(`/visit-workflow?visitId=${payload.visitId}`);
      },
      "تم إنشاء زيارة محوّلة وربطها بالإحالة."
    );
  }

  function complete(referral: ReferralRecord) {
    run(
      referral,
      () => apiRequest(`/center/referrals/${referral.id}/complete`, { method: "POST" }),
      "تم إكمال الإحالة."
    );
  }

  function managerActions(referral: ReferralRecord) {
    if (!canReview || activeView !== "incoming") {
      return null;
    }

    if (reviewStatuses.has(referral.status)) {
      return (
        <div className="page-stack compact">
          <button className="primary-button" disabled={busyId === referral.id} onClick={() => accept(referral)} type="button">
            قبول
          </button>
          <label className="field">
            <span>سبب الرفض</span>
            <input
              value={rejectReasons[referral.id] ?? ""}
              onChange={(event) => setRejectReasons((current) => ({ ...current, [referral.id]: event.target.value }))}
            />
          </label>
          <button className="danger-button" disabled={busyId === referral.id} onClick={() => reject(referral)} type="button">
            رفض
          </button>
        </div>
      );
    }

    if (referral.status === "RECEIVING_MANAGER_ACCEPTED") {
      return (
        <div className="page-stack compact">
          <label className="field">
            <span>الطبيب المختص</span>
            <select
              value={doctorAssignments[referral.id] ?? ""}
              onChange={(event) => setDoctorAssignments((current) => ({ ...current, [referral.id]: event.target.value }))}
            >
              <option value="">اختر الطبيب</option>
              {(doctors?.doctors ?? []).filter((doctor) => doctor.isActive).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.profile?.specialization ? `${doctor.fullName} - ${doctor.profile.specialization}` : doctor.fullName}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={busyId === referral.id} onClick={() => assignDoctor(referral)} type="button">
            إسناد
          </button>
        </div>
      );
    }

    return null;
  }

  function doctorActions(referral: ReferralRecord) {
    if (!canSeeAssigned || activeView !== "assigned") {
      return null;
    }

    if (referral.status === "ASSIGNED_TO_DOCTOR") {
      const draft = visitDrafts[referral.id] ?? { symptoms: "", diagnosis: "" };
      return (
        <div className="page-stack compact">
          <label className="field">
            <span>الأعراض الأولية</span>
            <input
              value={draft.symptoms}
              onChange={(event) =>
                setVisitDrafts((current) => ({ ...current, [referral.id]: { ...draft, symptoms: event.target.value } }))
              }
            />
          </label>
          <label className="field">
            <span>تشخيص مبدئي</span>
            <input
              value={draft.diagnosis}
              onChange={(event) =>
                setVisitDrafts((current) => ({ ...current, [referral.id]: { ...draft, diagnosis: event.target.value } }))
              }
            />
          </label>
          <button className="primary-button" disabled={busyId === referral.id} onClick={() => startVisit(referral)} type="button">
            بدء زيارة محوّلة
          </button>
        </div>
      );
    }

    if (referral.status === "VISIT_CREATED") {
      return (
        <div className="button-row">
          {referral.createdVisitId ? (
            <button className="ghost-button" onClick={() => navigate(`/visit-workflow?visitId=${referral.createdVisitId}`)} type="button">
              فتح الزيارة
            </button>
          ) : null}
          <button className="primary-button" disabled={busyId === referral.id} onClick={() => complete(referral)} type="button">
            إكمال الإحالة
          </button>
        </div>
      );
    }

    return null;
  }

  function renderReferralDetailsPanel(referral: ReferralRecord) {
    const manager = managerActions(referral);
    const doctor = doctorActions(referral);

    return (
      <article className="profile-tile is-selected">
        <div className="button-row">
          <div>
            <p className="eyebrow">تفاصيل الإحالة</p>
            <h3>إحالة رقم {referral.id}</h3>
            <p className="muted">راجع بيانات الإحالة واتخذ القرار المناسب حسب صلاحياتك.</p>
          </div>
          <button className="ghost-button" onClick={closeReferralDetails} type="button">
            إغلاق التفاصيل
          </button>
        </div>

        <div className="detail-grid">
          <div>
            <span className="eyebrow">المريض</span>
            <strong>{referral.patientName ?? "مريض"}</strong>
            <p className="muted">{referral.patientUnifiedId ?? "لا يوجد رقم موحد"}</p>
          </div>
          <div>
            <span className="eyebrow">المسار</span>
            <strong>{referral.fromCenter}</strong>
            <p className="muted">محول إلى: {referral.toCenter}</p>
          </div>
          <div>
            <span className="eyebrow">التخصص المطلوب</span>
            <strong>{referral.requiredSpecialty}</strong>
            <p className="muted">{toArabicLabel(referral.priority)}</p>
          </div>
          <div>
            <span className="eyebrow">الحالة</span>
            <StatusBadge status={referral.status} />
            <p className="muted">{formatDateTime(referral.requestedAt)}</p>
          </div>
        </div>

        <div className="inline-note">
          سبب الإحالة: {referral.reason ?? "غير موثق"}
          {referral.notesFromSender ? ` | ملاحظات مرسلة: ${referral.notesFromSender}` : ""}
        </div>

        <div className="detail-grid">
          <div>
            <span className="eyebrow">سبب اختيار المركز</span>
            <p>{referral.selectedCenterReason ?? "لم يسجل المحرك سبب اختيار بعد."}</p>
          </div>
          <div>
            <span className="eyebrow">قرار المدير</span>
            <p>{referral.managerDecisionReason ?? referral.rejectionReason ?? "بانتظار القرار."}</p>
          </div>
          <div>
            <span className="eyebrow">المطابقة والانتظار</span>
            <p>
              {referral.matchingScore != null ? `درجة المطابقة ${referral.matchingScore}` : "درجة المطابقة غير متاحة"}
              {referral.estimatedWaitTimeMinutes != null
                ? ` | انتظار متوقع ${referral.estimatedWaitTimeMinutes} دقيقة`
                : ""}
            </p>
          </div>
          <div>
            <span className="eyebrow">الطبيب والزيارة</span>
            <p>
              {referral.assignedDoctor?.fullName ?? "لم تسند لطبيب بعد"}
              {referral.createdVisitId ? ` | زيارة رقم ${referral.createdVisitId}` : ""}
            </p>
          </div>
        </div>

        {manager || doctor ? (
          <div className="page-stack compact">
            {manager}
            {doctor}
          </div>
        ) : (
          <div className="empty-state compact">هذه الإحالة للمتابعة فقط في هذا الدور.</div>
        )}
      </article>
    );
  }

  return (
    <div className="page-stack">
      {selectedReferral ? (
        <div className="referral-details-backdrop" role="dialog" aria-modal="true" onClick={closeReferralDetails}>
          <div className="referral-details-dialog" onClick={(event) => event.stopPropagation()}>
            {renderReferralDetailsPanel(selectedReferral)}
          </div>
        </div>
      ) : null}

      {canRequest ? (
        <SectionCard
          title={canReview ? "طلب إحالة بناءً على توصية طبية" : "إنشاء إحالة ذكية"}
          subtitle={
            canReview
              ? "يُسجل المدير الطلب الإداري عندما تكون هناك توصية طبية واضحة، ثم يرشح النظام المركزي جهة مناسبة."
              : "المحرك المركزي يرشح مركزاً مناسباً، والقبول النهائي من مدير المركز المستقبل."
          }
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>المريض</span>
              <select required value={form.localPatientId} onChange={(event) => setForm((current) => ({ ...current, localPatientId: event.target.value }))}>
                <option value="">اختر المريض</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.fullName}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>التخصص المطلوب</span>
              <select required value={form.requiredSpecialty} onChange={(event) => setForm((current) => ({ ...current, requiredSpecialty: event.target.value }))}>
                {specialtyOptions.map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>درجة الاستعجال</span>
              <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                <option value="NORMAL">{toArabicLabel("NORMAL")}</option>
                <option value="URGENT">{toArabicLabel("URGENT")}</option>
                <option value="EMERGENCY">{toArabicLabel("EMERGENCY")}</option>
              </select>
            </label>
            <label className="field">
              <span>أقصى مسافة (كم)</span>
              <input min="1" type="number" value={form.maxDistanceKm} onChange={(event) => setForm((current) => ({ ...current, maxDistanceKm: event.target.value }))} />
            </label>
            <label className="field checkbox-field referral-checkbox-field">
              <input checked={form.requiresOr} onChange={(event) => setForm((current) => ({ ...current, requiresOr: event.target.checked }))} type="checkbox" />
              <span>تتطلب غرفة عمليات</span>
            </label>
            <label className="field">
              <span>المنطقة المفضلة</span>
              <input value={form.preferredRegion} onChange={(event) => setForm((current) => ({ ...current, preferredRegion: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>سبب الإحالة</span>
              <textarea required value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>{canReview ? "ملاحظة إدارية أو توصية طبية" : "ملاحظات سريرية"}</span>
              <input value={form.notesFromSender} onChange={(event) => setForm((current) => ({ ...current, notesFromSender: event.target.value }))} />
            </label>
            <button className="primary-button field-span-2" type="submit">إرسال طلب الإحالة</button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title={user?.workspace === "central" ? "متابعة الإحالات على مستوى الشبكة" : "إدارة الإحالات"} subtitle="متابعة الإحالة من الترشيح الآلي حتى الزيارة.">
        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="success-banner">{message}</div> : null}

        <div className="toolbar">
          {!canSeeAssigned ? (
            <button className={activeView === "all" ? "primary-button" : "ghost-button"} onClick={() => setActiveView("all")} type="button">
              {user?.workspace === "central" ? "كل الإحالات" : "سجل المركز"}
            </button>
          ) : null}
          {canReview ? <button className={activeView === "incoming" ? "primary-button" : "ghost-button"} onClick={() => setActiveView("incoming")} type="button">الإحالات الواردة ({incoming.length})</button> : null}
          {canSeeAssigned ? <button className={activeView === "assigned" ? "primary-button" : "ghost-button"} onClick={() => setActiveView("assigned")} type="button">إحالاتي المسندة ({assigned.length})</button> : null}
        </div>

        {user?.workspace === "central" ? (
          <div className="chip-row">
            {centralStatusFilters.map((status) => (
              <button className={statusFilter === status ? "primary-button" : "ghost-button"} key={status || "ALL"} onClick={() => (status ? setSearchParams({ status }) : setSearchParams({}))} type="button">
                {status ? toArabicLabel(status) : "الكل"}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state compact">جارٍ تحميل الإحالات...</div>
        ) : visibleReferrals.length === 0 ? (
          <div className="empty-state compact">لا توجد إحالات ضمن هذا التصنيف.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>المسار</th>
                  <th>الاحتياج</th>
                  <th>الحالة</th>
                  <th>التوقيت</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {visibleReferrals.map((referral) => {
                  return (
                    <tr
                      key={`${activeView}-${referral.id}`}
                      className={selectedReferralId === referral.id ? "is-selected referral-row-highlight" : undefined}
                    >
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
                        {referral.assignedDoctor ? <span>الطبيب: {referral.assignedDoctor.fullName}</span> : null}
                      </td>
                      <td>
                        <strong>{formatDateTime(referral.requestedAt)}</strong>
                        {referral.decisionAt ? <span>قرار: {formatDateTime(referral.decisionAt)}</span> : null}
                        {referral.visitCreatedAt ? <span>زيارة: {formatDateTime(referral.visitCreatedAt)}</span> : null}
                      </td>
                      <td>
                        <button className="ghost-button" onClick={() => openReferralDetails(referral)} type="button">
                          عرض التفاصيل والإجراءات
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
