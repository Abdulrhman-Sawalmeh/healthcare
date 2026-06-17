import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import {
  FollowUpReminderRecord,
  FollowUpReminderStatus,
  MedicationRefillRequestRecord,
  PatientTimelineBundle,
  PatientTimelineEventType
} from "../types";

type TimelineFilter = "all" | PatientTimelineEventType;

const eventConfig: Record<
  PatientTimelineEventType,
  { label: string; marker: string; tone: string }
> = {
  refill_request: { label: "تجديد دواء", marker: "د", tone: "prescription" },
  follow_up: { label: "متابعة", marker: "م", tone: "appointment" },
  appointment: { label: "موعد", marker: "م", tone: "appointment" },
  diagnosis: { label: "تشخيص", marker: "ت", tone: "diagnosis" },
  prescription: { label: "وصفة", marker: "و", tone: "prescription" },
  lab_result: { label: "مختبر", marker: "خ", tone: "lab" },
  referral: { label: "إحالة", marker: "إ", tone: "referral" },
  note: { label: "ملاحظة", marker: "ن", tone: "note" }
};

const refillStepLabels: Record<string, string> = {
  REQUESTED: "طلب جديد",
  DOCTOR_APPROVED: "وافق الطبيب",
  PHARMACY_PREPARING: "قيد التجهيز",
  READY_FOR_PICKUP: "جاهز للاستلام",
  COLLECTED: "تم الاستلام",
  REJECTED: "مرفوض"
};

const followUpLabels: Record<FollowUpReminderStatus, string> = {
  PENDING: "قيد المتابعة",
  DONE: "منجز",
  CANCELLED: "ملغي",
  MISSED: "فائت"
};

function refillStatusLabel(status: string) {
  return refillStepLabels[status] ?? toArabicLabel(status);
}

function nextPharmacyStatus(status: string) {
  if (status === "DOCTOR_APPROVED") return "PHARMACY_PREPARING";
  if (status === "PHARMACY_PREPARING") return "READY_FOR_PICKUP";
  if (status === "READY_FOR_PICKUP") return "COLLECTED";
  return null;
}

function nextPharmacyLabel(status: string) {
  const next = nextPharmacyStatus(status);

  return next ? refillStatusLabel(next) : null;
}

function isReminderOverdue(reminder: FollowUpReminderRecord) {
  return reminder.status === "PENDING" && new Date(reminder.dueDate).getTime() < Date.now();
}

export function PatientTimelinePage() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<PatientTimelineBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>("all");
  const [reminderForm, setReminderForm] = useState({
    dueDate: "",
    reason: "",
    notes: ""
  });

  const canReviewRefills = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";
  const canUpdatePharmacy = user?.role === "CENTER_MANAGER" || user?.role === "PHARMACIST";
  const canManageReminders = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";

  const refreshTimeline = useCallback(async () => {
    if (!patientId) {
      return;
    }

    const payload = await apiRequest<PatientTimelineBundle>(`/patients/${patientId}/timeline`);
    setBundle(payload);
    setError("");
  }, [patientId]);

  useEffect(() => {
    let isActive = true;

    async function loadTimeline() {
      if (!patientId) {
        setError("تعذر تحديد المريض المطلوب.");
        setLoading(false);
        return;
      }

      try {
        const payload = await apiRequest<PatientTimelineBundle>(`/patients/${patientId}/timeline`);

        if (!isActive) {
          return;
        }

        setBundle(payload);
        setError("");
      } catch (cause) {
        if (!isActive) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "تعذر تحميل السجل الزمني للمريض.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadTimeline();

    return () => {
      isActive = false;
    };
  }, [patientId]);

  async function reviewRefillRequest(request: MedicationRefillRequestRecord, decision: "APPROVE" | "REJECT") {
    const rejectionReason =
      decision === "REJECT" ? window.prompt("اكتب سبب رفض طلب تجديد الدواء")?.trim() : undefined;

    if (decision === "REJECT" && !rejectionReason) {
      return;
    }

    setBusyId(`refill-review-${request.id}-${decision}`);
    setActionError("");
    setActionMessage("");

    try {
      await apiRequest(`/center/refill-requests/${request.id}/doctor`, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          ...(rejectionReason ? { rejectionReason } : {})
        })
      });
      setActionMessage(decision === "APPROVE" ? "تمت الموافقة على طلب التجديد." : "تم رفض طلب التجديد.");
      await refreshTimeline();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر تحديث طلب تجديد الدواء.");
    } finally {
      setBusyId(null);
    }
  }

  async function advanceRefillStatus(request: MedicationRefillRequestRecord) {
    const nextStatus = nextPharmacyStatus(request.status);

    if (!nextStatus) {
      return;
    }

    setBusyId(`refill-status-${request.id}`);
    setActionError("");
    setActionMessage("");

    try {
      await apiRequest(`/center/refill-requests/${request.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus
        })
      });
      setActionMessage("تم تحديث حالة التجديد في الصيدلية.");
      await refreshTimeline();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر تحديث حالة التجديد.");
    } finally {
      setBusyId(null);
    }
  }

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!bundle || !reminderForm.dueDate || !reminderForm.reason.trim()) {
      setActionError("أدخل تاريخ المتابعة والسبب.");
      return;
    }

    setBusyId("create-reminder");
    setActionError("");
    setActionMessage("");

    try {
      await apiRequest("/center/follow-up-reminders", {
        method: "POST",
        body: JSON.stringify({
          patientId: bundle.patient.id,
          dueDate: new Date(`${reminderForm.dueDate}T09:00:00`).toISOString(),
          reason: reminderForm.reason.trim(),
          notes: reminderForm.notes.trim() || undefined
        })
      });
      setReminderForm({ dueDate: "", reason: "", notes: "" });
      setActionMessage("تم إنشاء تذكير المتابعة وإشعار المريض.");
      await refreshTimeline();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر إنشاء تذكير المتابعة.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateReminderStatus(reminder: FollowUpReminderRecord, status: FollowUpReminderStatus) {
    setBusyId(`reminder-${reminder.id}-${status}`);
    setActionError("");
    setActionMessage("");

    try {
      await apiRequest(`/center/follow-up-reminders/${reminder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setActionMessage("تم تحديث تذكير المتابعة.");
      await refreshTimeline();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر تحديث تذكير المتابعة.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="empty-state">جارٍ تحميل السجل الزمني للمريض...</div>;
  }

  if (error || !bundle) {
    return (
      <div className="page-stack">
        <Link className="action-hint" to="/patients">
          العودة إلى قائمة المرضى
        </Link>
        <div className="error-banner">{error || "تعذر تحميل السجل الزمني."}</div>
      </div>
    );
  }

  const filterOptions: Array<{ value: TimelineFilter; label: string; count: number }> = [
    {
      value: "all",
      label: "الكل",
      count: bundle.events.length
    },
    ...Object.entries(eventConfig).map(([value, config]) => ({
      value: value as PatientTimelineEventType,
      label: config.label,
      count: bundle.events.filter((event) => event.type === value).length
    }))
  ];

  const filteredEvents =
    activeFilter === "all"
      ? bundle.events
      : bundle.events.filter((event) => event.type === activeFilter);
  const refillRequests = bundle.refillRequests ?? [];
  const followUpReminders = bundle.followUpReminders ?? [];

  return (
    <div className="page-stack">
      <div className="profile-toolbar">
        <Link className="action-hint" to={`/patients/${bundle.patient.id}`}>
          العودة إلى ملف المريض
        </Link>
        <Link className="ghost-button" to="/patients">
          قائمة المرضى
        </Link>
      </div>

      <SectionCard
        title="السجل الزمني الطبي"
        subtitle={joinMeta([
          bundle.patient.fullName,
          bundle.patient.unifiedId ?? "سجل محلي",
          bundle.patient.nationalId ?? "بدون هوية"
        ])}
      >
        <div className="detail-grid">
          <div className="detail-field">
            <span>الهاتف</span>
            <strong>{bundle.patient.phone}</strong>
          </div>
          <div className="detail-field">
            <span>تاريخ الميلاد</span>
            <strong>{formatDate(bundle.patient.dateOfBirth)}</strong>
          </div>
          <div className="detail-field">
            <span>الجنس</span>
            <strong>{toArabicLabel(bundle.patient.gender)}</strong>
          </div>
          <div className="detail-field">
            <span>آخر حدث</span>
            <strong>{bundle.patient.lastEventAt ? formatDateTime(bundle.patient.lastEventAt) : "-"}</strong>
          </div>
        </div>

        <div className="chip-row">
          {bundle.patient.centersSeenAt.map((center) => (
            <span key={center.centerId} className="tag">
              {center.centerName}
            </span>
          ))}
        </div>
      </SectionCard>

      {actionError ? <div className="error-banner">{actionError}</div> : null}
      {actionMessage ? <div className="success-banner">{actionMessage}</div> : null}

      <SectionCard
        title="تجديد الأدوية وتذكيرات المتابعة"
        subtitle="إدارة طلبات التجديد الحالية وإنشاء تذكير متابعة يظهر للمريض في السجل الطبي."
      >
        <div className="split-grid">
          <div className="stack-list">
            <div>
              <p className="eyebrow">طلبات تجديد الدواء</p>
              <h3>{refillRequests.length} طلب</h3>
            </div>

            {refillRequests.map((request) => {
              const nextLabel = nextPharmacyLabel(request.status);

              return (
                <article key={request.id} className="stack-item">
                  <div className="progress-row">
                    <strong>{request.medicineName}</strong>
                    <span className={request.status === "REJECTED" ? "status-badge danger" : "status-badge success"}>
                      {refillStatusLabel(request.status)}
                    </span>
                  </div>
                  <p className="muted">
                    {joinMeta([
                      request.dosage,
                      request.duration,
                      request.doctorName ?? "بدون طبيب",
                      formatDateTime(request.requestedAt)
                    ])}
                  </p>
                  {request.rejectionReason ? <p className="muted">سبب الرفض: {request.rejectionReason}</p> : null}
                  <div className="chip-row">
                    {canReviewRefills && request.status === "REQUESTED" ? (
                      <>
                        <button
                          className="primary-button"
                          disabled={busyId === `refill-review-${request.id}-APPROVE`}
                          onClick={() => void reviewRefillRequest(request, "APPROVE")}
                          type="button"
                        >
                          موافقة الطبيب
                        </button>
                        <button
                          className="ghost-button"
                          disabled={busyId === `refill-review-${request.id}-REJECT`}
                          onClick={() => void reviewRefillRequest(request, "REJECT")}
                          type="button"
                        >
                          رفض
                        </button>
                      </>
                    ) : null}
                    {canUpdatePharmacy && nextLabel ? (
                      <button
                        className="primary-button"
                        disabled={busyId === `refill-status-${request.id}`}
                        onClick={() => void advanceRefillStatus(request)}
                        type="button"
                      >
                        {nextLabel}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {refillRequests.length === 0 ? <div className="empty-state compact">لا توجد طلبات تجديد دواء لهذا المريض.</div> : null}
          </div>

          <div className="stack-list">
            <div>
              <p className="eyebrow">تذكيرات المتابعة</p>
              <h3>{followUpReminders.length} تذكير</h3>
            </div>

            {canManageReminders ? (
              <form className="form-grid" onSubmit={createReminder}>
                <label className="field">
                  <span>تاريخ المتابعة</span>
                  <input
                    onChange={(event) => setReminderForm((current) => ({ ...current, dueDate: event.target.value }))}
                    type="date"
                    value={reminderForm.dueDate}
                  />
                </label>
                <label className="field">
                  <span>سبب المتابعة</span>
                  <input
                    onChange={(event) => setReminderForm((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="مثال: مراجعة نتيجة التحليل"
                    value={reminderForm.reason}
                  />
                </label>
                <label className="field full">
                  <span>ملاحظات</span>
                  <textarea
                    onChange={(event) => setReminderForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="ملاحظات داخلية قصيرة"
                    value={reminderForm.notes}
                  />
                </label>
                <button className="primary-button" disabled={busyId === "create-reminder"} type="submit">
                  إنشاء تذكير
                </button>
              </form>
            ) : null}

            {followUpReminders.map((reminder) => (
              <article key={reminder.id} className="stack-item">
                <div className="progress-row">
                  <strong>{reminder.reason}</strong>
                  <span className={isReminderOverdue(reminder) ? "status-badge danger" : "status-badge success"}>
                    {isReminderOverdue(reminder) ? "متأخر" : followUpLabels[reminder.status]}
                  </span>
                </div>
                <p className="muted">
                  {joinMeta([reminder.doctorName, formatDateTime(reminder.dueDate), reminder.visitSummary])}
                </p>
                {reminder.notes ? <p className="muted">{reminder.notes}</p> : null}
                {canManageReminders && reminder.status === "PENDING" ? (
                  <div className="chip-row">
                    <button
                      className="primary-button"
                      disabled={busyId === `reminder-${reminder.id}-DONE`}
                      onClick={() => void updateReminderStatus(reminder, "DONE")}
                      type="button"
                    >
                      تم
                    </button>
                    <button
                      className="ghost-button"
                      disabled={busyId === `reminder-${reminder.id}-CANCELLED`}
                      onClick={() => void updateReminderStatus(reminder, "CANCELLED")}
                      type="button"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : null}
              </article>
            ))}

            {followUpReminders.length === 0 ? <div className="empty-state compact">لا توجد تذكيرات متابعة لهذا المريض.</div> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="الأحداث الطبية" subtitle="مرتبة من الأحدث إلى الأقدم مع إمكانية الفلترة حسب نوع الحدث.">
        <div className="timeline-filters">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={activeFilter === option.value ? "timeline-filter active" : "timeline-filter"}
              onClick={() => setActiveFilter(option.value)}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </button>
          ))}
        </div>

        <p className="muted">
          {activeFilter === "all"
            ? `إجمالي الأحداث الظاهرة: ${filteredEvents.length}`
            : `الأحداث الظاهرة بعد الفلترة: ${filteredEvents.length}`}
        </p>

        {filteredEvents.length > 0 ? (
          <div className="timeline-shell">
            {filteredEvents.map((event) => {
              const config = eventConfig[event.type];

              return (
                <article key={event.id} className="timeline-item">
                  <div className={`timeline-marker ${config.tone}`}>{config.marker}</div>
                  <div className="timeline-card">
                    <div className="timeline-card-head">
                      <div>
                        <p className="eyebrow">{config.label}</p>
                        <h4>{event.title}</h4>
                      </div>
                      <span className="timeline-date">{formatDateTime(event.date)}</span>
                    </div>
                    <p>{event.description}</p>
                    <div className="timeline-meta">
                      <span>سجلها: {event.createdBy}</span>
                      {event.status ? <span>{toArabicLabel(event.status)}</span> : null}
                      <span>{event.sourceTable}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state compact">
            {bundle.events.length === 0
              ? "لا توجد أحداث طبية لعرضها في السجل الزمني حتى الآن."
              : "لا توجد أحداث تطابق نوع الفلتر المختار."}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
