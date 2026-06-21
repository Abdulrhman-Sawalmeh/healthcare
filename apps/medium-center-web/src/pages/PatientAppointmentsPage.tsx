import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { requestAppointmentSuggestions } from "../api/appointment-suggestions";
import { ApiError, apiRequest } from "../api/client";
import { SmartBookingAssistant } from "../components/SmartBookingAssistant";
import { StatusBadge } from "../components/StatusBadge";
import { SuggestedAppointmentSlots } from "../components/SuggestedAppointmentSlots";
import { useAuth } from "../context/AuthContext";
import { BookingReasonPreset, getSmartBookingInsight } from "../lib/booking-assistant";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import {
  AppointmentPriority,
  PortalAppointmentRecord,
  PortalAppointmentSuggestionRecord,
  PortalDoctorRecord
} from "../types";

type AppointmentFormState = {
  doctorId: string;
  scheduledAt: string;
  type: "CLINIC" | "FOLLOW_UP" | "TELEMEDICINE";
  priority: AppointmentPriority;
  reason: string;
  notes: string;
};

type SlotWindow = "ANY" | "MORNING" | "AFTERNOON";

const initialForm: AppointmentFormState = {
  doctorId: "",
  scheduledAt: "",
  type: "CLINIC",
  priority: "NORMAL",
  reason: "",
  notes: ""
};

const careOptions = [
  {
    title: "زيارة حضورية",
    description: "مناسبة للفحص السريري، التحويلات، والصور والفحوصات التي تحتاج وجودك في المركز."
  },
  {
    title: "متابعة علاجية",
    description: "مثالية لمراجعة نتائج، تعديل خطة علاجية، أو متابعة بعد زيارة أو إجراء سابق."
  },
  {
    title: "استشارة عن بُعد",
    description: "مفيدة للأسئلة السريعة، مراجعة الأدوية، وتجديد الوصفات عندما لا تحتاج فحصًا مباشرًا."
  },
  {
    title: "حالة عاجلة",
    description: "ابحث عن أقرب موعد متاح، وإذا كانت الحالة طارئة فعليًا فلا تنتظر الحجز الإلكتروني."
  }
] as const;

const preVisitChecklist = [
  "أضف سبب الزيارة بوضوح حتى يحصل الطبيب على سياق أفضل قبل الموعد.",
  "إذا كانت لديك نتائج فحوصات أو صور سابقة فاكتب ذلك في الملاحظات.",
  "للمتابعات السريعة أو مراجعة الأدوية، قد تكون الاستشارة عن بُعد مناسبة.",
  "في الحالات الطارئة أو الأعراض المتفاقمة بسرعة، استخدم الطوارئ بدل الحجز المجدول."
];

const slotWindowOptions: Array<{ value: SlotWindow; label: string }> = [
  { value: "ANY", label: "أي وقت" },
  { value: "MORNING", label: "صباحًا" },
  { value: "AFTERNOON", label: "بعد الظهر" }
];

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toSuggestionSearchDate(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
}

function isSameDay(dateValue: string) {
  const candidate = new Date(dateValue);
  const now = new Date();

  return (
    candidate.getFullYear() === now.getFullYear() &&
    candidate.getMonth() === now.getMonth() &&
    candidate.getDate() === now.getDate()
  );
}

function matchesSlotWindow(dateValue: string, slotWindow: SlotWindow) {
  if (slotWindow === "ANY") {
    return true;
  }

  const hour = new Date(dateValue).getHours();

  if (slotWindow === "MORNING") {
    return hour < 12;
  }

  return hour >= 12;
}

export function PatientAppointmentsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<PortalAppointmentRecord[]>([]);
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [form, setForm] = useState<AppointmentFormState>(initialForm);
  const [suggestions, setSuggestions] = useState<PortalAppointmentSuggestionRecord[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmedAppointment, setConfirmedAppointment] = useState<PortalAppointmentRecord | null>(null);
  const [preferredSlotWindow, setPreferredSlotWindow] = useState<SlotWindow>("ANY");
  const [sameDayOnly, setSameDayOnly] = useState(false);
  const successRef = useRef<HTMLElement | null>(null);
  const bookingFormRef = useRef<HTMLElement | null>(null);
  const availabilitySectionRef = useRef<HTMLDivElement | null>(null);
  const submitActionsRef = useRef<HTMLDivElement | null>(null);

  const doctorIdFromQuery = searchParams.get("doctorId") ?? "";
  const scheduledAtFromQuery = searchParams.get("scheduledAt") ?? "";

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [appointmentsPayload, doctorsPayload] = await Promise.all([
        apiRequest<PortalAppointmentRecord[]>("/portal/appointments"),
        apiRequest<PortalDoctorRecord[]>("/portal/doctors")
      ]);

      setAppointments(appointmentsPayload);
      setDoctors(doctorsPayload);
    } catch {
      setError("تعذر تحميل بيانات المواعيد الحالية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (doctors.length === 0) {
      return;
    }

    const nextDoctorId =
      doctorIdFromQuery && doctors.some((doctor) => doctor.id === doctorIdFromQuery) ? doctorIdFromQuery : "";
    const nextScheduledAt = scheduledAtFromQuery ? toDateTimeLocalValue(scheduledAtFromQuery) : "";

    if (!nextDoctorId && !nextScheduledAt) {
      return;
    }

    setForm((current) => {
      const updatedDoctorId = nextDoctorId || current.doctorId;
      const updatedScheduledAt = nextScheduledAt || current.scheduledAt;

      if (updatedDoctorId === current.doctorId && updatedScheduledAt === current.scheduledAt) {
        return current;
      }

      return {
        ...current,
        doctorId: updatedDoctorId,
        scheduledAt: updatedScheduledAt
      };
    });

    setError("");
    setSuccessMessage("");
    scrollToSection(bookingFormRef.current);
  }, [doctorIdFromQuery, scheduledAtFromQuery, doctors]);

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === form.doctorId),
    [doctors, form.doctorId]
  );

  const latestDoctorId = useMemo(() => {
    const latestAppointment = appointments.reduce<PortalAppointmentRecord | null>((latest, appointment) => {
      if (appointment.status === "CANCELLED") {
        return latest;
      }

      if (!latest) {
        return appointment;
      }

      return new Date(appointment.scheduledAt).getTime() > new Date(latest.scheduledAt).getTime()
        ? appointment
        : latest;
    }, null);

    return latestAppointment?.doctor.id ?? "";
  }, [appointments]);

  const upcomingAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          new Date(appointment.scheduledAt).getTime() >= Date.now() &&
          appointment.status !== "CANCELLED"
      ),
    [appointments]
  );

  const previousAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          new Date(appointment.scheduledAt).getTime() < Date.now() || appointment.status === "CANCELLED"
      ),
    [appointments]
  );

  const bookingInsight = useMemo(
    () =>
      getSmartBookingInsight({
        form,
        doctors,
        selectedDoctor,
        suggestions
      }),
    [form, doctors, selectedDoctor, suggestions]
  );

  const visibleSuggestions = useMemo(
    () =>
      suggestions.filter((suggestion) => {
        const matchesWindow = matchesSlotWindow(suggestion.scheduledAt, preferredSlotWindow);
        const matchesSameDay = !sameDayOnly || isSameDay(suggestion.scheduledAt);
        return matchesWindow && matchesSameDay;
      }),
    [suggestions, preferredSlotWindow, sameDayOnly]
  );

  const bookingReadinessScore = useMemo(() => {
    let score = 15;

    if (form.doctorId) {
      score += 25;
    }

    if (form.scheduledAt) {
      score += 20;
    }

    if (form.reason.trim().length >= 12) {
      score += 20;
    } else if (form.reason.trim().length >= 5) {
      score += 10;
    }

    if (form.notes.trim().length >= 8) {
      score += 10;
    }

    if (selectedDoctor) {
      score += 5;
    }

    if (visibleSuggestions.length > 0) {
      score += 5;
    }

    return Math.min(score, 100);
  }, [form.doctorId, form.notes, form.reason, form.scheduledAt, selectedDoctor, visibleSuggestions.length]);

  const dynamicVisitTasks = useMemo(() => {
    const tasks = [...preVisitChecklist];

    if (form.reason.trim().length < 12) {
      tasks.unshift("أضف وصفًا أدق للأعراض أو سبب الزيارة حتى يحصل الطبيب على سياق أوضح.");
    }

    if (!form.notes.trim()) {
      tasks.unshift("أضف في الملاحظات قائمة أدويتك الحالية أو أي نتائج تريد مناقشتها.");
    }

    if (form.type === "FOLLOW_UP") {
      tasks.unshift("جهّز نتائج التحاليل أو تقرير الزيارة السابقة لأن هذا الموعد متابعة.");
    }

    if (form.type === "TELEMEDICINE") {
      tasks.unshift("تأكد من توفر اتصال إنترنت جيد وهاتف مشحون لأن الموعد عن بُعد.");
    }

    if (form.type === "CLINIC") {
      tasks.unshift("احضر قبل الموعد بعشر دقائق إذا كانت هذه زيارتك الأولى أو لديك مستندات مطلوبة.");
    }

    if (bookingInsight.recommendedPriority === "EMERGENCY") {
      tasks.unshift("إذا كانت الأعراض شديدة أو تتفاقم سريعًا، لا تنتظر الموعد الإلكتروني وتوجه للطوارئ.");
    }

    if (visibleSuggestions.length === 0 && selectedDoctor) {
      tasks.unshift("جرّب توسيع فلتر الوقت أو إزالة خيار نفس اليوم لرؤية مواعيد إضافية.");
    }

    return Array.from(new Set(tasks)).slice(0, 6);
  }, [form.notes, form.reason, form.type, bookingInsight.recommendedPriority, visibleSuggestions.length, selectedDoctor]);

  const nextAvailableSlot = visibleSuggestions[0] ?? suggestions[0];
  const sameDaySlots = suggestions.filter((suggestion) => isSameDay(suggestion.scheduledAt)).length;
  const doctorsCount = doctors.length;
  const specialtiesCount = new Set(doctors.map((doctor) => doctor.specialization)).size;

  function clearSuggestions() {
    setSuggestionsLoading(false);
    setSuggestions([]);
    setSuggestionsError("");
  }

  function clearFeedback() {
    setError("");
    setSuccessMessage("");
    setConfirmedAppointment(null);
  }

  function scrollToSection(target: HTMLElement | null) {
    window.setTimeout(() => {
      target?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 0);
  }

  function updateForm(updates: Partial<AppointmentFormState>) {
    setForm((current) => ({
      ...current,
      ...updates
    }));
  }

  async function loadSuggestions(preferredDate = form.scheduledAt, options: { scrollToAvailability?: boolean } = {}) {
    if (!selectedDoctor) {
      clearSuggestions();
      setSuggestionsError("اختر الطبيب أولًا لعرض المواعيد المتاحة له.");
      return;
    }

    setSuggestionsLoading(true);
    setSuggestionsError("");

    try {
      const payload = await requestAppointmentSuggestions({
        doctorId: selectedDoctor.id,
        preferredDate: toSuggestionSearchDate(preferredDate),
        appointmentType: form.type,
        priority: form.priority
      });

      setSuggestions(payload);

      if (payload.length === 0) {
        setSuggestionsError("لا توجد مواعيد متاحة قريبة لهذا الطبيب حاليًا.");
      }
    } catch (cause) {
      setSuggestions([]);
      setSuggestionsError(
        cause instanceof ApiError ? cause.message : "تعذر تحميل المواعيد المتاحة للطبيب في الوقت الحالي."
      );
    } finally {
      setSuggestionsLoading(false);
      if (options.scrollToAvailability) {
        scrollToSection(availabilitySectionRef.current);
      }
    }
  }

  useEffect(() => {
    if (!selectedDoctor) {
      clearSuggestions();
      return;
    }

    void loadSuggestions();
  }, [selectedDoctor?.id, form.scheduledAt, form.type, form.priority]);

  function applySuggestion(suggestion: PortalAppointmentSuggestionRecord) {
    updateForm({
      doctorId: suggestion.doctor.id,
      scheduledAt: toDateTimeLocalValue(suggestion.scheduledAt)
    });
    clearFeedback();
    clearSuggestions();
    scrollToSection(submitActionsRef.current);
  }

  function applyPreset(preset: BookingReasonPreset) {
    updateForm({
      reason: preset.reason,
      notes: preset.notes ?? "",
      type: preset.type,
      priority: preset.priority,
      doctorId:
        preset.type === "FOLLOW_UP" && !form.doctorId && latestDoctorId ? latestDoctorId : form.doctorId
    });
    clearFeedback();
  }

  function applyInsightRecommendation() {
    updateForm({
      type: bookingInsight.recommendedType,
      priority: bookingInsight.recommendedPriority,
      doctorId: bookingInsight.recommendedDoctor?.id ?? form.doctorId,
      scheduledAt: bookingInsight.recommendedSlot
        ? toDateTimeLocalValue(bookingInsight.recommendedSlot.scheduledAt)
        : form.scheduledAt
    });
    clearFeedback();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.center?.id || !selectedDoctor) {
      setError("يرجى اختيار الطبيب أولًا.");
      return;
    }

    if (!form.scheduledAt || form.reason.trim().length < 5) {
      setError("يرجى إدخال موعد مستقبلي وسبب زيارة واضح.");
      return;
    }

    if (new Date(form.scheduledAt).getTime() <= Date.now()) {
      setError("يرجى اختيار وقت مستقبلي صالح لحجز الموعد.");
      return;
    }

    setSubmitting(true);
    clearFeedback();
    clearSuggestions();

    try {
      const scheduledAtIso = new Date(form.scheduledAt).toISOString();

      const createdAppointment = await apiRequest<PortalAppointmentRecord>("/portal/appointments", {
        method: "POST",
        body: JSON.stringify({
          centerId: String(user.center.id),
          departmentId: selectedDoctor.department.id,
          doctorId: selectedDoctor.id,
          scheduledAt: scheduledAtIso,
          type: form.type,
          reason: form.reason,
          notes: form.notes || undefined
        })
      });

      setConfirmedAppointment(createdAppointment);
      setSuccessMessage(
        `تم حجز موعدك بنجاح في ${formatDateTime(createdAppointment.scheduledAt)}. سيتواصل معك الطبيب قريباً.`
      );
      setForm(initialForm);
      clearSuggestions();
      await loadData();
      scrollToSection(successRef.current);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("الموعد الذي أدخلته غير متاح لهذا الطبيب. اختر موعدًا متاحًا من الاقتراحات التالية.");
        await loadSuggestions(form.scheduledAt, { scrollToAvailability: true });
      } else {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "تعذر حجز الموعد. تأكد من اختيار موعد مستقبلي وطبيب متاح."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAppointment(appointmentId: string) {
    clearFeedback();

    try {
      await apiRequest(`/portal/appointments/${appointmentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "CANCELLED"
        })
      });

      await loadData();
    } catch {
      setError("تعذر إلغاء الموعد الحالي.");
    }
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل المواعيد...</div>;
  }

  return (
    <div className="page-stack booking-page">
      <section className="hero-strip booking-hero">
        <div className="booking-hero-content">
          <div>
            <p className="eyebrow">Smart Patient Booking</p>
            <h1>منصة حجز احترافية للمريض</h1>
          <p className="muted">
            اختر الطبيب، راجع التوفر الفعلي، واستفد من مساعد ذكي يقترح عليك المسار الأنسب للحجز قبل تثبيت
            الموعد.
          </p>
        </div>

          <div className="chip-row">
            <Link className="ghost-button" to="/doctors">
              استكشاف الأطباء
            </Link>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                if (selectedDoctor) {
                  void loadSuggestions(form.scheduledAt, { scrollToAvailability: true });
                }
              }}
              disabled={!selectedDoctor || suggestionsLoading}
            >
              تحديث التوفر
            </button>
          </div>
        </div>

        <div className="booking-stat-grid">
          <article className="booking-stat-card">
            <span>الأطباء المتاحون</span>
            <strong>{doctorsCount}</strong>
            <p>ضمن بوابة المركز الحالية</p>
          </article>
          <article className="booking-stat-card">
            <span>التخصصات</span>
            <strong>{specialtiesCount}</strong>
            <p>يمكن الحجز معها مباشرة</p>
          </article>
          <article className="booking-stat-card">
            <span>مواعيد اليوم</span>
            <strong>{sameDaySlots}</strong>
            <p>{selectedDoctor ? "للطبيب المحدد" : "بعد اختيار الطبيب"}</p>
          </article>
          <article className="booking-stat-card">
            <span>أقرب موعد</span>
            <strong>{nextAvailableSlot ? formatDateTime(nextAvailableSlot.scheduledAt) : "-"}</strong>
            <p>{selectedDoctor ? "من الاقتراحات الحالية" : "اختر طبيبًا لرؤيته"}</p>
          </article>
        </div>
      </section>

      {confirmedAppointment ? (
        <section className="section-card booking-success-card" ref={successRef}>
          <div className="success-banner">{successMessage}</div>
          <div className="info-row">
            <div>
              <p className="eyebrow">تم تأكيد إرسال الطلب للطبيب</p>
              <h3>نجاح الحجز بالموعد المحدد</h3>
              <p className="muted">
                الموعد مع {confirmedAppointment.doctor.fullName} في قسم {confirmedAppointment.department.name}.
              </p>
            </div>
            <StatusBadge status={confirmedAppointment.status} />
          </div>
          <div className="tile-stats">
            <span>{formatDateTime(confirmedAppointment.scheduledAt)}</span>
            <span>{toArabicLabel(confirmedAppointment.type)}</span>
            <span>{confirmedAppointment.center.name}</span>
          </div>
        </section>
      ) : null}

      <section className="care-path-grid">
        {careOptions.map((option) => (
          <article className="care-path-card" key={option.title}>
            <strong>{option.title}</strong>
            <p>{option.description}</p>
          </article>
        ))}
      </section>

      <section className="booking-layout">
        <div className="booking-main-column">
          <section className="section-card booking-form-card" ref={bookingFormRef}>
            <div className="section-header">
              <div>
                <p className="eyebrow">طلب موعد جديد</p>
                <h3>ابنِ الحجز بالطريقة التي تناسب حالتك</h3>
              </div>
              <span className="tag">{selectedDoctor ? selectedDoctor.department.name : "اختر الطبيب أولًا"}</span>
            </div>

            <div className="assistant-preset-grid">
              <button
                className="assistant-preset-button"
                type="button"
                onClick={() =>
                  applyPreset({
                    id: "urgent-clinic",
                    label: "زيارة سريعة",
                    reason: "أحتاج إلى تقييم سريع لحالة صحية ظهرت مؤخرًا.",
                    type: "CLINIC",
                    priority: "URGENT"
                  })
                }
              >
                <strong>بدء سريع</strong>
                <span>موعد عاجل</span>
              </button>
              <button
                className="assistant-preset-button"
                type="button"
                onClick={() =>
                  applyPreset({
                    id: "followup-check",
                    label: "مراجعة خطة",
                    reason: "أحتاج إلى متابعة الحالة الحالية ومراجعة الخطة العلاجية.",
                    type: "FOLLOW_UP",
                    priority: "NORMAL"
                  })
                }
              >
                <strong>متابعة علاجية</strong>
                <span>نتائج أو علاج</span>
              </button>
              <button
                className="assistant-preset-button"
                type="button"
                onClick={() =>
                  applyPreset({
                    id: "virtual-care",
                    label: "استشارة مرنة",
                    reason: "أحتاج إلى استشارة أولية سريعة بخصوص الأعراض الحالية.",
                    type: "TELEMEDICINE",
                    priority: "NORMAL"
                  })
                }
              >
                <strong>استشارة عن بُعد</strong>
                <span>أسئلة أو أدوية</span>
              </button>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>الطبيب</span>
                <select
                  value={form.doctorId}
                  onChange={(event) => {
                    updateForm({ doctorId: event.target.value });
                    clearFeedback();
                    clearSuggestions();
                  }}
                >
                  <option value="">اختر الطبيب</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.fullName} - {doctor.specialization}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>التاريخ والوقت</span>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) => {
                    updateForm({ scheduledAt: event.target.value });
                    clearFeedback();
                    clearSuggestions();
                  }}
                />
              </label>

              <label className="field">
                <span>نوع الموعد</span>
                <select
                  value={form.type}
                  onChange={(event) => {
                    updateForm({
                      type: event.target.value as AppointmentFormState["type"],
                      doctorId:
                        event.target.value === "FOLLOW_UP" && !form.doctorId && latestDoctorId
                          ? latestDoctorId
                          : form.doctorId
                    });
                    clearFeedback();
                    clearSuggestions();
                  }}
                >
                  <option value="CLINIC">زيارة عيادية</option>
                  <option value="FOLLOW_UP">متابعة</option>
                  <option value="TELEMEDICINE">استشارة عن بُعد</option>
                </select>
              </label>

              <label className="field">
                <span>أولوية الموعد</span>
                <select
                  value={form.priority}
                  onChange={(event) => {
                    updateForm({
                      priority: event.target.value as AppointmentPriority
                    });
                    clearFeedback();
                    clearSuggestions();
                  }}
                >
                  <option value="NORMAL">{toArabicLabel("NORMAL")}</option>
                  <option value="URGENT">{toArabicLabel("URGENT")}</option>
                  <option value="EMERGENCY">{toArabicLabel("EMERGENCY")}</option>
                </select>
              </label>

              {selectedDoctor ? (
                <div className="field-span-2 doctor-spotlight-card">
                  <div className="info-row">
                    <div>
                      <p className="eyebrow">الطبيب المحدد</p>
                      <strong>{selectedDoctor.fullName}</strong>
                      <p className="muted">{selectedDoctor.specialization}</p>
                    </div>
                    <span className="tag">{selectedDoctor.department.name}</span>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-field">
                      <span>القسم</span>
                      <strong>{selectedDoctor.department.name}</strong>
                    </div>
                    <div className="detail-field">
                      <span>سنوات الخبرة</span>
                      <strong>{selectedDoctor.yearsExperience} سنوات</strong>
                    </div>
                    <div className="detail-field">
                      <span>أقرب وقت متاح</span>
                      <strong>{nextAvailableSlot ? formatDateTime(nextAvailableSlot.scheduledAt) : "قيد التحديث"}</strong>
                    </div>
                    <div className="detail-field">
                      <span>وسيلة التواصل</span>
                      <strong>{selectedDoctor.phone ?? selectedDoctor.email}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              <label className="field field-span-2">
                <span>سبب الزيارة</span>
                <textarea
                  value={form.reason}
                  placeholder="مثال: أحتاج إلى مراجعة نتائج التحاليل، أو أعاني من ألم جديد في الصدر..."
                  onChange={(event) => {
                    updateForm({ reason: event.target.value });
                    clearFeedback();
                  }}
                />
              </label>

              <label className="field field-span-2">
                <span>ملاحظات إضافية للطبيب</span>
                <textarea
                  value={form.notes}
                  placeholder="أدوية حالية، نتائج سابقة، أو أي سياق إضافي يساعد الطبيب."
                  onChange={(event) => {
                    updateForm({ notes: event.target.value });
                    clearFeedback();
                  }}
                />
              </label>

              {successMessage && !confirmedAppointment ? (
                <div className="success-banner field-span-2">{successMessage}</div>
              ) : null}
              {error ? <div className="error-banner field-span-2">{error}</div> : null}

              <div className="field-span-2 availability-filter-shell" ref={availabilitySectionRef}>
                <div className="info-row">
                  <div>
                    <strong>فلترة التوفر</strong>
                    <p className="muted">خصص عرض المواعيد المتاحة حسب وقت اليوم أو المواعيد المتاحة اليوم فقط.</p>
                  </div>
                  <span className="tag">{visibleSuggestions.length} مطابق</span>
                </div>

                <div className="availability-filter-grid">
                  <div className="chip-row">
                    {slotWindowOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`timeline-filter ${preferredSlotWindow === option.value ? "active" : ""}`}
                        type="button"
                        onClick={() => {
                          setPreferredSlotWindow(option.value);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <button
                    className={`timeline-filter ${sameDayOnly ? "active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSameDayOnly((current) => !current);
                    }}
                  >
                    اليوم فقط
                    <strong>{sameDaySlots}</strong>
                  </button>
                </div>
              </div>

              <SuggestedAppointmentSlots
                suggestions={visibleSuggestions}
                loading={suggestionsLoading}
                error={
                  suggestionsError ||
                  (suggestions.length > 0 && visibleSuggestions.length === 0
                    ? "لا توجد مواعيد تطابق فلتر الوقت الحالي. جرّب تغيير الفلتر."
                    : "")
                }
                onSelect={applySuggestion}
              />

              <div className="field-span-2 button-row" ref={submitActionsRef}>
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? "جارٍ تثبيت الموعد..." : "تأكيد الحجز"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    if (selectedDoctor) {
                      void loadSuggestions(form.scheduledAt, { scrollToAvailability: true });
                    }
                  }}
                  disabled={!selectedDoctor || suggestionsLoading}
                >
                  عرض التوفر الحالي
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside className="booking-sidebar">
          <SmartBookingAssistant
            form={form}
            insight={bookingInsight}
            readinessScore={bookingReadinessScore}
            visitTasks={dynamicVisitTasks}
            onApplyPreset={applyPreset}
            onApplyInsight={applyInsightRecommendation}
          />

          <article className="section-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">جاهزية الموعد</p>
                <h3>لوحة الاستعداد والملخص</h3>
              </div>
              <span className="tag">{bookingReadinessScore}% جاهز</span>
            </div>

            <div className="readiness-meter">
              <div className="progress-bar">
                <span style={{ width: `${bookingReadinessScore}%` }} />
              </div>
            </div>

            {selectedDoctor ? (
              <div className="stack-list compact">
                <div className="stack-item">
                  <strong>{selectedDoctor.fullName}</strong>
                  <p className="muted">{selectedDoctor.specialization}</p>
                  <div className="tile-stats">
                    <span>{toArabicLabel(form.type)}</span>
                    <span>{toArabicLabel(form.priority)}</span>
                    <span>{form.scheduledAt ? formatDateTime(new Date(form.scheduledAt)) : "لم يتم اختيار موعد بعد"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state compact">اختر طبيبًا ليظهر ملخص الموعد هنا.</div>
            )}

            <div className="stack-item prep-task-card">
              <strong>مهام مقترحة قبل الموعد</strong>
              <ul className="checklist-list">
                {dynamicVisitTasks.slice(0, 4).map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </div>
          </article>

          <article className="section-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">قبل الزيارة</p>
                <h3>إرشادات سريعة</h3>
              </div>
            </div>
            <ul className="checklist-list">
              {preVisitChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </aside>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">المواعيد القادمة</p>
              <h3>الزيارات النشطة</h3>
            </div>
            <span className="tag">{upcomingAppointments.length} نشطة</span>
          </div>
          <div className="stack-list">
            {upcomingAppointments.map((appointment) => (
              <div className="stack-item" key={appointment.id}>
                <div className="info-row">
                  <div>
                    <strong>{appointment.doctor.fullName}</strong>
                    <p>{appointment.reason}</p>
                  </div>
                  <span className="tag">{toArabicLabel(appointment.status)}</span>
                </div>
                <div className="tile-stats">
                  <span>{formatDateTime(appointment.scheduledAt)}</span>
                  <span>{appointment.department.name}</span>
                  <span>{toArabicLabel(appointment.type)}</span>
                </div>
                {appointment.status !== "COMPLETED" && appointment.status !== "CANCELLED" ? (
                  <button className="ghost-button" type="button" onClick={() => void cancelAppointment(appointment.id)}>
                    إلغاء الموعد
                  </button>
                ) : null}
              </div>
            ))}
            {upcomingAppointments.length === 0 ? (
              <div className="empty-state compact">لا توجد مواعيد قادمة حاليًا.</div>
            ) : null}
          </div>
        </article>

        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">السجل الزمني</p>
              <h3>المواعيد السابقة</h3>
            </div>
            <span className="tag">{previousAppointments.length} سجل</span>
          </div>
          <div className="stack-list compact">
            {previousAppointments.map((appointment) => (
              <div className="stack-item" key={appointment.id}>
                <strong>{appointment.doctor.fullName}</strong>
                <p>{appointment.reason}</p>
                <div className="tile-stats">
                  <span>{formatDateTime(appointment.scheduledAt)}</span>
                  <span>{toArabicLabel(appointment.type)}</span>
                  <span>{toArabicLabel(appointment.status)}</span>
                </div>
              </div>
            ))}
            {previousAppointments.length === 0 ? (
              <div className="empty-state compact">لا توجد مواعيد سابقة بعد.</div>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
