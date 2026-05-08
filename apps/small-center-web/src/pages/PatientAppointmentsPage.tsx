import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { PortalAppointmentRecord, PortalDoctorRecord } from "../types";

type AppointmentFormState = {
  doctorId: string;
  scheduledAt: string;
  type: "CLINIC" | "FOLLOW_UP" | "TELEMEDICINE";
  reason: string;
  notes: string;
};

const initialForm: AppointmentFormState = {
  doctorId: "",
  scheduledAt: "",
  type: "CLINIC",
  reason: "",
  notes: ""
};

export function PatientAppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<PortalAppointmentRecord[]>([]);
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [form, setForm] = useState<AppointmentFormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    loadData();
  }, []);

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === form.doctorId),
    [doctors, form.doctorId]
  );

  const upcomingAppointments = appointments.filter(
    (appointment) =>
      new Date(appointment.scheduledAt).getTime() >= Date.now() &&
      appointment.status !== "CANCELLED"
  );

  const previousAppointments = appointments.filter(
    (appointment) =>
      new Date(appointment.scheduledAt).getTime() < Date.now() ||
      appointment.status === "CANCELLED"
  );

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

    setSubmitting(true);
    setError("");

    try {
      await apiRequest("/portal/appointments", {
        method: "POST",
        body: JSON.stringify({
          centerId: String(user.center.id),
          departmentId: selectedDoctor.department.id,
          doctorId: selectedDoctor.id,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          type: form.type,
          reason: form.reason,
          notes: form.notes || undefined
        })
      });

      setForm(initialForm);
      await loadData();
    } catch {
      setError("تعذر حجز الموعد. تأكد من اختيار موعد مستقبلي وطبيب متاح.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAppointment(appointmentId: string) {
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
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">حجز وإدارة المواعيد</p>
          <h1>تنظيم الزيارة القادمة</h1>
          <p className="muted">احجز موعدًا جديدًا أو راجع المواعيد القادمة والسابقة من نفس الشاشة.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">طلب موعد جديد</p>
            <h3>اختيار الطبيب والوقت المناسب</h3>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>الطبيب</span>
            <select
              value={form.doctorId}
              onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))}
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
              onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>نوع الموعد</span>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value as AppointmentFormState["type"]
                }))
              }
            >
              <option value="CLINIC">زيارة عيادية</option>
              <option value="FOLLOW_UP">متابعة</option>
              <option value="TELEMEDICINE">استشارة عن بُعد</option>
            </select>
          </label>

          <label className="field field-span-2">
            <span>سبب الزيارة</span>
            <textarea
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            />
          </label>

          <label className="field field-span-2">
            <span>ملاحظات إضافية للطبيب</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>

          {error ? <div className="error-banner field-span-2">{error}</div> : null}

          <div className="field-span-2">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "جارٍ تثبيت الموعد..." : "تأكيد الحجز"}
            </button>
          </div>
        </form>
      </section>

      <section className="split-grid">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">المواعيد القادمة</p>
              <h3>الزيارات النشطة</h3>
            </div>
          </div>
          <div className="stack-list">
            {upcomingAppointments.map((appointment) => (
              <div className="stack-item" key={appointment.id}>
                <strong>{appointment.doctor.fullName}</strong>
                <p>{appointment.reason}</p>
                <div className="tile-stats">
                  <span>{formatDateTime(appointment.scheduledAt)}</span>
                  <span>{appointment.department.name}</span>
                  <span>{toArabicLabel(appointment.status)}</span>
                </div>
                {appointment.status !== "COMPLETED" && appointment.status !== "CANCELLED" ? (
                  <button className="ghost-button" type="button" onClick={() => cancelAppointment(appointment.id)}>
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
