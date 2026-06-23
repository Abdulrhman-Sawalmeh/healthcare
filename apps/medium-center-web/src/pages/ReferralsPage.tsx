import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { CenterDoctorsBundle, LocalPatientRecord, ReferralRecord } from "../types";

type ReferralView = "all" | "incoming" | "assigned";

const defaultReferralForm = {
  localPatientId: "",
  requiredSpecialty: "",
  priority: "URGENT",
  reason: "",
  requiresOr: false,
  requiredMedicineIds: "",
  preferredRegion: "",
  maxDistanceKm: "120",
  notesFromSender: ""
};

const centralStatusFilters = [
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

const reviewStatuses = new Set(["AUTO_SELECTED", "PENDING_RECEIVING_MANAGER"]);

function getReferralMeta(referral: ReferralRecord) {
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [incomingReferrals, setIncomingReferrals] = useState<ReferralRecord[]>([]);
  const [assignedReferrals, setAssignedReferrals] = useState<ReferralRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [doctorBundle, setDoctorBundle] = useState<CenterDoctorsBundle | null>(null);
  const [activeView, setActiveView] = useState<ReferralView>("all");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyReferralId, setBusyReferralId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultReferralForm);
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [doctorAssignments, setDoctorAssignments] = useState<Record<number, string>>({});
  const [visitDrafts, setVisitDrafts] = useState<Record<number, { symptoms: string; diagnosis: string; notes: string }>>({});

  const statusFilter = searchParams.get("status") ?? "";
  const viewParam = searchParams.get("view");
  const selectedReferralId = Number(searchParams.get("referralId") ?? 0);
  const canRequest = user?.workspace === "center" && user.role === "DOCTOR";
  const canReviewIncoming = user?.workspace === "center" && user.role === "CENTER_MANAGER";
  const canSeeAssigned = user?.workspace === "center" && user.role === "DOCTOR";
  const showAllReferralLog = user?.role !== "DOCTOR";

  async function loadData() {
    setLoading(true);

    try {
      setError("");
      const nextReferrals = await apiRequest<ReferralRecord[]>(
        user?.workspace === "central" ? "/central/referrals" : "/center/referrals"
      );

      setReferrals(nextReferrals);

      if (user?.workspace !== "center") {
        setPatients([]);
        setIncomingReferrals([]);
        setAssignedReferrals([]);
        setDoctorBundle(null);
        return;
      }

      const requests: Array<Promise<void>> = [];

      if (canRequest) {
        requests.push(
          apiRequest<LocalPatientRecord[]>("/center/patients").then((payload) => {
            setPatients(payload);
          })
        );
      }

      if (canRequest || canReviewIncoming) {
        requests.push(
          apiRequest<CenterDoctorsBundle>("/center/doctors").then((payload) => {
            setDoctorBundle(payload);
            setForm((current) =>
              current.requiredSpecialty
                ? current
                : {
                    ...current,
                    requiredSpecialty: payload.specialtyOptions[0] ?? ""
                  }
            );
          })
        );
      }

      if (canReviewIncoming) {
        requests.push(
          apiRequest<ReferralRecord[]>("/center/referrals/incoming").then((payload) => {
            setIncomingReferrals(payload);
          })
        );
      }

      if (canSeeAssigned) {
        requests.push(
          apiRequest<ReferralRecord[]>("/center/referrals/assigned-to-me").then((payload) => {
            setAssignedReferrals(payload);
          })
        );
      }

      await Promise.all(requests);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData()
      .catch((cause: Error) => setError(cause.message));
  }, [user?.workspace, user?.role]);

  useEffect(() => {
    if (viewParam === "incoming" && canReviewIncoming) {
      setActiveView("incoming");
    } else if (viewParam === "assigned" && canSeeAssigned) {
      setActiveView("assigned");
    } else if (canSeeAssigned) {
      setActiveView("assigned");
    } else if (!showAllReferralLog && activeView === "all") {
      setActiveView("assigned");
    }
  }, [activeView, canReviewIncoming, canSeeAssigned, showAllReferralLog, viewParam]);

  useEffect(() => {
    if (!selectedReferralId || loading) {
      return;
    }

    const element = document.getElementById(`referral-${selectedReferralId}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.classList.add("target-highlight");
    const timeout = window.setTimeout(() => element.classList.remove("target-highlight"), 2200);

    return () => window.clearTimeout(timeout);
  }, [loading, selectedReferralId]);

  useEffect(() => {
    if (selectedReferralId > 0 || viewParam !== "incoming" || incomingReferrals.length !== 1) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.set("referralId", String(incomingReferrals[0].id));
    setSearchParams(params);
  }, [incomingReferrals, searchParams, selectedReferralId, setSearchParams, viewParam]);

  const currentReferrals = useMemo(() => {
    const source =
      activeView === "incoming"
        ? incomingReferrals
        : activeView === "assigned"
          ? assignedReferrals
          : showAllReferralLog
            ? referrals
            : assignedReferrals;

    if (!statusFilter) {
      return source;
    }

    return source.filter((referral) => referral.status === statusFilter);
  }, [activeView, assignedReferrals, incomingReferrals, referrals, showAllReferralLog, statusFilter]);

  const doctorOptions = doctorBundle?.doctors.filter((doctor) => doctor.isActive) ?? [];
  const specialtyOptions = doctorBundle?.specialtyOptions ?? [];
  const selectedReferral = useMemo(
    () =>
      [...incomingReferrals, ...assignedReferrals, ...referrals].find(
        (referral) => referral.id === selectedReferralId
      ) ?? null,
    [assignedReferrals, incomingReferrals, referrals, selectedReferralId]
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

  async function refreshAfterAction(message: string) {
    await loadData();
    setError("");
    setSuccessMessage(message);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.localPatientId) {
      setError("اختر المريض قبل إرسال طلب الإحالة.");
      return;
    }

    if (!form.requiredSpecialty.trim()) {
      setError("اختر التخصص المطلوب من القائمة المرجعية.");
      return;
    }

    try {
      if (form.reason.trim().length < 5) {
        setError("اكتب سبب الإحالة بشكل واضح قبل الإرسال.");
        return;
      }

      const maxDistanceKm = Number(form.maxDistanceKm);

      if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) {
        setError("أدخل مسافة قصوى صحيحة بالكيلومتر.");
        return;
      }

      const requiredMedicineIds = form.requiredMedicineIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(Number);

      if (requiredMedicineIds.some((medicineId) => !Number.isInteger(medicineId) || medicineId <= 0)) {
        setError("معرفات الأدوية يجب أن تكون أرقامًا صحيحة مفصولة بفواصل.");
        return;
      }

      await apiRequest("/center/referrals/request", {
        method: "POST",
        body: JSON.stringify({
          localPatientId: Number(form.localPatientId),
          requiredSpecialty: form.requiredSpecialty,
          priority: form.priority,
          reason: form.reason,
          requiresOr: form.requiresOr,
          requiredMedicineIds,
          preferredRegion: form.preferredRegion || undefined,
          maxDistanceKm,
          notesFromSender: form.notesFromSender || undefined,
          processNow: true
        })
      });

      setForm({
        ...defaultReferralForm,
        requiredSpecialty: specialtyOptions[0] ?? ""
      });
      await refreshAfterAction("تم إرسال طلب الإحالة إلى المحرك المركزي.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الإحالة.");
    }
  }

  async function runReferralAction(referralId: number, action: () => Promise<unknown>, message: string) {
    try {
      setBusyReferralId(referralId);
      await action();
      await refreshAfterAction(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية على الإحالة.");
    } finally {
      setBusyReferralId(null);
    }
  }

  function handleManagerAccept(referral: ReferralRecord) {
    void runReferralAction(
      referral.id,
      () => apiRequest(`/center/referrals/${referral.id}/manager-accept`, { method: "POST" }),
      "تم قبول الإحالة. يمكن الآن إسنادها لطبيب مختص."
    );
  }

  function handleManagerReject(referral: ReferralRecord) {
    const reason = rejectReasons[referral.id]?.trim();

    if (!reason) {
      setError("سبب الرفض مطلوب قبل إرسال القرار.");
      return;
    }

    void runReferralAction(
      referral.id,
      () =>
        apiRequest(`/center/referrals/${referral.id}/manager-reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        }),
      "تم رفض الإحالة مع حفظ السبب وإبلاغ المركز المُرسل."
    );
  }

  function handleAssignDoctor(referral: ReferralRecord) {
    const doctorId = doctorAssignments[referral.id];

    if (!doctorId) {
      setError("اختر الطبيب قبل إسناد الإحالة.");
      return;
    }

    void runReferralAction(
      referral.id,
      () =>
        apiRequest(`/center/referrals/${referral.id}/assign-doctor`, {
          method: "POST",
          body: JSON.stringify({ doctorId: Number(doctorId) })
        }),
      "تم إسناد الإحالة للطبيب وإرسال إشعار له."
    );
  }

  function handleStartVisit(referral: ReferralRecord) {
    const draft = visitDrafts[referral.id] ?? { symptoms: "", diagnosis: "", notes: "" };

    void runReferralAction(
      referral.id,
      async () => {
        const payload = await apiRequest<{ visitId: number }>(`/center/referrals/${referral.id}/start-visit`, {
          method: "POST",
          body: JSON.stringify({
            symptoms: draft.symptoms || undefined,
            diagnosis: draft.diagnosis || undefined,
            notes: draft.notes || undefined,
            visitType: "CONSULTATION"
          })
        });

        navigate(`/visit-workflow?visitId=${payload.visitId}`);
      },
      "تم إنشاء زيارة محوّلة وربطها بالإحالة."
    );
  }

  function handleCompleteReferral(referral: ReferralRecord) {
    void runReferralAction(
      referral.id,
      () => apiRequest(`/center/referrals/${referral.id}/complete`, { method: "POST" }),
      "تم إكمال الإحالة وحفظها في السجل."
    );
  }

  function renderManagerActions(referral: ReferralRecord) {
    if (!canReviewIncoming || activeView !== "incoming") {
      return null;
    }

    if (reviewStatuses.has(referral.status)) {
      return (
        <div className="page-stack compact">
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busyReferralId === referral.id}
              onClick={() => handleManagerAccept(referral)}
              type="button"
            >
              قبول الإحالة
            </button>
          </div>
          <label className="field">
            <span>سبب الرفض عند الحاجة</span>
            <input
              value={rejectReasons[referral.id] ?? ""}
              onChange={(event) =>
                setRejectReasons((current) => ({ ...current, [referral.id]: event.target.value }))
              }
              placeholder="مثال: لا تتوفر عيادة مناسبة اليوم"
            />
          </label>
          <button
            className="danger-button"
            disabled={busyReferralId === referral.id}
            onClick={() => handleManagerReject(referral)}
            type="button"
          >
            رفض مع السبب
          </button>
        </div>
      );
    }

    if (referral.status === "RECEIVING_MANAGER_ACCEPTED") {
      return (
        <div className="page-stack compact">
          <label className="field">
            <span>إسناد لطبيب</span>
            <select
              value={doctorAssignments[referral.id] ?? ""}
              onChange={(event) =>
                setDoctorAssignments((current) => ({ ...current, [referral.id]: event.target.value }))
              }
            >
              <option value="">اختر الطبيب</option>
              {doctorOptions.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.profile?.specialization
                    ? `${doctor.fullName} - ${doctor.profile.specialization}`
                    : doctor.fullName}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            disabled={busyReferralId === referral.id}
            onClick={() => handleAssignDoctor(referral)}
            type="button"
          >
            إسناد الإحالة
          </button>
        </div>
      );
    }

    return null;
  }

  function renderDoctorActions(referral: ReferralRecord) {
    if (!canSeeAssigned || activeView !== "assigned") {
      return null;
    }

    if (referral.status === "ASSIGNED_TO_DOCTOR") {
      const draft = visitDrafts[referral.id] ?? { symptoms: "", diagnosis: "", notes: "" };

      return (
        <div className="page-stack compact">
          <label className="field">
            <span>الأعراض الأولية</span>
            <input
              value={draft.symptoms}
              onChange={(event) =>
                setVisitDrafts((current) => ({
                  ...current,
                  [referral.id]: { ...draft, symptoms: event.target.value }
                }))
              }
            />
          </label>
          <label className="field">
            <span>تشخيص مبدئي اختياري</span>
            <input
              value={draft.diagnosis}
              onChange={(event) =>
                setVisitDrafts((current) => ({
                  ...current,
                  [referral.id]: { ...draft, diagnosis: event.target.value }
                }))
              }
              placeholder={`زيارة إحالة إلى ${referral.requiredSpecialty}`}
            />
          </label>
          <button
            className="primary-button"
            disabled={busyReferralId === referral.id}
            onClick={() => handleStartVisit(referral)}
            type="button"
          >
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
          <button
            className="primary-button"
            disabled={busyReferralId === referral.id}
            onClick={() => handleCompleteReferral(referral)}
            type="button"
          >
            إكمال الإحالة
          </button>
        </div>
      );
    }

    return null;
  }

  function renderReferralDetailsPanel(referral: ReferralRecord) {
    const managerActions = renderManagerActions(referral);
    const doctorActions = renderDoctorActions(referral);

    return (
      <article className="profile-tile is-selected">
        <div className="button-row">
          <div>
            <p className="eyebrow">تفاصيل الإحالة</p>
            <h3>إحالة رقم {referral.id}</h3>
            <p className="muted">راجع بيانات الإحالة واتخذ الإجراء المناسب حسب صلاحياتك.</p>
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
            <span className="eyebrow">المركز المُرسل</span>
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

        {managerActions || doctorActions ? (
          <div className="page-stack compact">
            {managerActions}
            {doctorActions}
          </div>
        ) : (
          <div className="empty-state compact">هذه الإحالة للمتابعة فقط في هذا الدور.</div>
        )}
      </article>
    );
  }

  return (
    <div className="page-stack">
      {canRequest ? (
        <SectionCard
          title="إنشاء إحالة ذكية"
          subtitle="المحرك المركزي يرشح أفضل مركز فقط، والقبول النهائي يتم من مدير المركز المستقبل."
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>المريض</span>
              <select
                required
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
              <select
                required
                value={form.requiredSpecialty}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requiredSpecialty: event.target.value }))
                }
              >
                <option value="">اختر التخصص</option>
                {specialtyOptions.map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty}
                  </option>
                ))}
              </select>
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
                inputMode="decimal"
                value={form.maxDistanceKm}
                onChange={(event) => setForm((current) => ({ ...current, maxDistanceKm: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>المنطقة المفضلة</span>
              <input
                value={form.preferredRegion}
                onChange={(event) => setForm((current) => ({ ...current, preferredRegion: event.target.value }))}
              />
            </label>
            <label className="field checkbox-field">
              <input
                checked={form.requiresOr}
                onChange={(event) => setForm((current) => ({ ...current, requiresOr: event.target.checked }))}
                type="checkbox"
              />
              <span>تتطلب غرفة عمليات</span>
            </label>
            <label className="field field-span-2">
              <span>سبب الإحالة</span>
              <textarea
                required
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
                onChange={(event) => setForm((current) => ({ ...current, notesFromSender: event.target.value }))}
              />
            </label>
            <button className="primary-button field-span-2" type="submit">
              إرسال طلب الإحالة
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={user?.workspace === "central" ? "متابعة الإحالات على مستوى الشبكة" : "إدارة الإحالات"}
        subtitle="يعرض السجل حالة الإحالة من الترشيح الآلي حتى قرار المدير، إسناد الطبيب، وإنشاء الزيارة."
      >
        {error ? <div className="error-banner">{error}</div> : null}
        {successMessage ? <div className="success-banner">{successMessage}</div> : null}

        <div className={showAllReferralLog ? "toolbar" : "toolbar doctor-referral-toolbar"}>
          <button className={activeView === "all" ? "primary-button" : "ghost-button"} onClick={() => setActiveView("all")} type="button">
            {user?.workspace === "central" ? "كل إحالات الشبكة" : "سجل المركز"}
          </button>
          {canReviewIncoming ? (
            <button
              className={activeView === "incoming" ? "primary-button" : "ghost-button"}
              onClick={() => setActiveView("incoming")}
              type="button"
            >
              الإحالات الواردة
            </button>
          ) : null}
          {canSeeAssigned ? (
            <button
              className={activeView === "assigned" ? "primary-button" : "ghost-button"}
              onClick={() => setActiveView("assigned")}
              type="button"
            >
              الحالات المحوّلة للطبيب
            </button>
          ) : null}
        </div>

        {user?.workspace === "central" ? (
          <div className="chip-row">
            {centralStatusFilters.map((status) => (
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

        {selectedReferral ? renderReferralDetailsPanel(selectedReferral) : null}

        {loading ? (
          <div className="empty-state compact">جارٍ تحميل الإحالات...</div>
        ) : currentReferrals.length === 0 ? (
          <div className="empty-state compact">لا توجد إحالات ضمن هذا التصنيف حالياً.</div>
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
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {currentReferrals.map((referral) => {
                  const managerActions = renderManagerActions(referral);
                  const doctorActions = renderDoctorActions(referral);

                  return (
                    <tr id={`referral-${referral.id}`} key={`${activeView}-${referral.id}`}>
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
                        {getReferralMeta(referral).map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </td>
                      <td>
                        <strong>{formatDateTime(referral.requestedAt)}</strong>
                        {referral.decisionAt ? <span>قرار: {formatDateTime(referral.decisionAt)}</span> : null}
                        {referral.assignedAt ? <span>إسناد: {formatDateTime(referral.assignedAt)}</span> : null}
                        {referral.visitCreatedAt ? <span>زيارة: {formatDateTime(referral.visitCreatedAt)}</span> : null}
                      </td>
                      <td>
                        <button className="ghost-button" onClick={() => openReferralDetails(referral)} type="button">
                          عرض التفاصيل
                        </button>
                        {managerActions}
                        {doctorActions}
                        {!managerActions && !doctorActions ? <span className="muted">متابعة فقط</span> : null}
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
