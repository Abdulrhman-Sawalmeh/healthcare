import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError, apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { PortalAppointmentRecord } from "../types";

const activeStatuses = new Set(["SCHEDULED", "CONFIRMED"]);

export function DoctorAppointmentsPage() {
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<PortalAppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedAppointmentId = searchParams.get("appointmentId") ?? "";

  async function loadAppointments() {
    setLoading(true);
    setError("");

    try {
      const payload = await apiRequest<PortalAppointmentRecord[]>("/portal/appointments");
      setAppointments(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل حجوزات المرضى.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort((first, second) => {
        if (first.id === selectedAppointmentId) return -1;
        if (second.id === selectedAppointmentId) return 1;
        return new Date(first.scheduledAt).getTime() - new Date(second.scheduledAt).getTime();
      }),
    [appointments, selectedAppointmentId]
  );

  const selectedAppointment = useMemo(
    () => appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null,
    [appointments, selectedAppointmentId]
  );

  const upcomingAppointments = sortedAppointments.filter(
    (appointment) =>
      new Date(appointment.scheduledAt).getTime() >= Date.now() &&
      appointment.status !== "CANCELLED" &&
      appointment.status !== "COMPLETED"
  );

  async function updateAppointmentStatus(appointment: PortalAppointmentRecord, status: "CONFIRMED" | "CANCELLED") {
    setBusyId(appointment.id);
    setError("");
    setSuccessMessage("");

    try {
      await apiRequest(`/portal/appointments/${appointment.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          notes:
            status === "CANCELLED"
              ? [appointment.notes, "تم رفض الموعد من قبل الطبيب."].filter(Boolean).join("\n")
              : appointment.notes ?? undefined
        })
      });

      setSuccessMessage(status === "CONFIRMED" ? "تم تأكيد الموعد وإشعار المريض." : "تم رفض الموعد وإشعار المريض.");
      await loadAppointments();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "تعذر تحديث حالة الموعد.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل مواعيد الطبيب...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">مواعيد المرضى</p>
          <h1>تفاصيل الحجوزات القادمة</h1>
          <p className="muted">راجع حجز المريض، ثم أكد الموعد أو ارفضه حسب توفر وقتك.</p>
        </div>
      </section>

      {selectedAppointmentId && !selectedAppointment ? (
        <div className="error-banner">لم يتم العثور على الموعد المطلوب أو لا يخص حساب الطبيب الحالي.</div>
      ) : null}
      {successMessage ? <div className="success-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {selectedAppointment ? (
        <SectionCard title="تفاصيل الحجز المحدد" subtitle="تم فتح هذا الموعد من الإشعار.">
          <div className="stack-item highlighted-appointment">
            <div className="info-row">
              <div>
                <p className="eyebrow">{selectedAppointment.department.name}</p>
                <h3>{selectedAppointment.patient.fullName}</h3>
                <p className="muted">رقم الملف: {selectedAppointment.patient.medicalRecordNumber}</p>
              </div>
              <StatusBadge status={selectedAppointment.status} />
            </div>
            <div className="tile-stats">
              <span>{formatDateTime(selectedAppointment.scheduledAt)}</span>
              <span>{toArabicLabel(selectedAppointment.type)}</span>
              <span>{selectedAppointment.doctor.fullName}</span>
            </div>
            <p>{selectedAppointment.reason}</p>
            {selectedAppointment.notes ? <p className="muted">{selectedAppointment.notes}</p> : null}
            <div className="button-row">
              <button
                className="primary-button"
                disabled={busyId === selectedAppointment.id || selectedAppointment.status === "CONFIRMED"}
                type="button"
                onClick={() => void updateAppointmentStatus(selectedAppointment, "CONFIRMED")}
              >
                تأكيد الموعد
              </button>
              <button
                className="danger-button"
                disabled={
                  busyId === selectedAppointment.id ||
                  selectedAppointment.status === "CANCELLED" ||
                  selectedAppointment.status === "COMPLETED"
                }
                type="button"
                onClick={() => void updateAppointmentStatus(selectedAppointment, "CANCELLED")}
              >
                رفض الموعد
              </button>
              <Link className="ghost-button" to={`/patients/${selectedAppointment.patient.id}`}>
                فتح ملف المريض
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="الحجوزات القادمة" subtitle="المواعيد التي تحتاج متابعة أو تأكيد.">
        <div className="stack-list">
          {upcomingAppointments.map((appointment) => (
            <article
              className={`stack-item ${appointment.id === selectedAppointmentId ? "highlighted-appointment" : ""}`}
              key={appointment.id}
            >
              <div className="info-row">
                <div>
                  <strong>{appointment.patient.fullName}</strong>
                  <p className="muted">{appointment.reason}</p>
                </div>
                <StatusBadge status={appointment.status} />
              </div>
              <div className="tile-stats">
                <span>{formatDateTime(appointment.scheduledAt)}</span>
                <span>{appointment.department.name}</span>
                <span>{toArabicLabel(appointment.type)}</span>
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  disabled={busyId === appointment.id || appointment.status === "CONFIRMED"}
                  type="button"
                  onClick={() => void updateAppointmentStatus(appointment, "CONFIRMED")}
                >
                  تأكيد
                </button>
                <button
                  className="danger-button"
                  disabled={busyId === appointment.id || !activeStatuses.has(appointment.status)}
                  type="button"
                  onClick={() => void updateAppointmentStatus(appointment, "CANCELLED")}
                >
                  رفض
                </button>
              </div>
            </article>
          ))}
          {upcomingAppointments.length === 0 ? (
            <div className="empty-state compact">لا توجد حجوزات قادمة تحتاج متابعة حالياً.</div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
