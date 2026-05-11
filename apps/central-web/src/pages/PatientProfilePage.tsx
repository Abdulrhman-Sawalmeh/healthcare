import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PatientTimelineBundle, PatientTimelineEvent, PatientTimelineEventType } from "../types";

const eventConfig: Record<
  PatientTimelineEventType,
  { label: string; marker: string; tone: string }
> = {
  appointment: { label: "موعد", marker: "م", tone: "appointment" },
  diagnosis: { label: "تشخيص", marker: "ت", tone: "diagnosis" },
  prescription: { label: "وصفة", marker: "و", tone: "prescription" },
  lab_result: { label: "مختبر", marker: "خ", tone: "lab" },
  referral: { label: "إحالة", marker: "إ", tone: "referral" },
  note: { label: "ملاحظة", marker: "ن", tone: "note" }
};

const defaultForm = {
  fullName: "",
  nationalId: "",
  dateOfBirth: "",
  gender: "MALE",
  primaryPhone: "",
  address: "",
  emergencyContact: "",
  bloodType: "",
  allergies: "",
  chronicDiseases: ""
};

function renderList(value: string[]) {
  return value.length > 0 ? value.join("، ") : "لا توجد بيانات مسجلة";
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function EventPreview({ event }: { event: PatientTimelineEvent }) {
  const config = eventConfig[event.type];

  return (
    <article className="timeline-preview-card">
      <div className="timeline-preview-top">
        <div className={`timeline-mini-icon ${config.tone}`}>{config.marker}</div>
        <div>
          <p className="eyebrow">{config.label}</p>
          <h4>{event.title}</h4>
        </div>
      </div>
      <p>{event.description}</p>
      <div className="timeline-meta">
        <span>{formatDateTime(event.date)}</span>
        <span>{event.createdBy}</span>
        <span>{event.sourceTable}</span>
      </div>
    </article>
  );
}

export function PatientProfilePage() {
  const { user } = useAuth();
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<PatientTimelineBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const canManage =
    user?.workspace === "center" &&
    (user.role === "CENTER_MANAGER" || user.role === "RECEPTIONIST" || user.role === "NURSE");

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
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
        setForm({
          fullName: payload.patient.fullName,
          nationalId: payload.patient.nationalId ?? "",
          dateOfBirth: payload.patient.dateOfBirth.slice(0, 10),
          gender: payload.patient.gender,
          primaryPhone: payload.patient.phone,
          address: payload.patient.address,
          emergencyContact: payload.patient.emergencyContact ?? "",
          bloodType: payload.patient.bloodType ?? "",
          allergies: payload.patient.allergies.join(", "),
          chronicDiseases: payload.patient.chronicDiseases.join(", ")
        });
        setError("");
      } catch (cause) {
        if (!isActive) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "تعذر تحميل ملف المريض.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [patientId]);

  async function reloadProfile() {
    if (!patientId) {
      return;
    }

    const payload = await apiRequest<PatientTimelineBundle>(`/patients/${patientId}/timeline`);
    setBundle(payload);
    setForm({
      fullName: payload.patient.fullName,
      nationalId: payload.patient.nationalId ?? "",
      dateOfBirth: payload.patient.dateOfBirth.slice(0, 10),
      gender: payload.patient.gender,
      primaryPhone: payload.patient.phone,
      address: payload.patient.address,
      emergencyContact: payload.patient.emergencyContact ?? "",
      bloodType: payload.patient.bloodType ?? "",
      allergies: payload.patient.allergies.join(", "),
      chronicDiseases: payload.patient.chronicDiseases.join(", ")
    });
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!bundle) {
      return;
    }

    try {
      setIsSubmitting(true);
      await apiRequest(`/center/patients/${bundle.patient.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: form.fullName,
          nationalId: form.nationalId || undefined,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          primaryPhone: form.primaryPhone,
          address: form.address,
          emergencyContact: form.emergencyContact || undefined,
          bloodType: form.bloodType || undefined,
          allergies: splitCsv(form.allergies),
          chronicDiseases: splitCsv(form.chronicDiseases)
        })
      });

      await reloadProfile();
      setIsEditing(false);
      setSuccessMessage("تم تحديث بيانات المريض بنجاح.");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث بيانات المريض.");
      setSuccessMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!bundle || !window.confirm("هل تريد حذف ملف هذا المريض المحلي؟")) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiRequest(`/center/patients/${bundle.patient.id}`, {
        method: "DELETE"
      });
      navigate("/patients");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف ملف المريض.");
      setSuccessMessage("");
      setIsDeleting(false);
    }
  }

  if (loading) {
    return <div className="empty-state">جارٍ تحميل ملف المريض...</div>;
  }

  if (error && !bundle) {
    return (
      <div className="page-stack">
        <Link className="action-hint" to="/patients">
          العودة إلى قائمة المرضى
        </Link>
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!bundle) {
    return null;
  }

  const previewEvents = bundle.events.slice(0, 4);

  return (
    <div className="page-stack">
      <div className="profile-toolbar">
        <Link className="action-hint" to="/patients">
          العودة إلى قائمة المرضى
        </Link>
        <div className="button-row">
          {canManage ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setIsEditing((current) => !current);
                setSuccessMessage("");
                setError("");
              }}
            >
              {isEditing ? "إلغاء التعديل" : "تعديل البيانات"}
            </button>
          ) : null}
          <Link className="primary-button" to={`/patients/${bundle.patient.id}/timeline`}>
            فتح السجل الزمني
          </Link>
        </div>
      </div>

      {successMessage ? <div className="empty-state compact">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {canManage && isEditing ? (
        <SectionCard title="تعديل بيانات المريض" subtitle="حدّث المعلومات الأساسية والسجل المحلي للمريض.">
          <form className="form-grid" onSubmit={handleUpdate}>
            <label className="field">
              <span>الاسم الكامل</span>
              <input
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>رقم الهوية</span>
              <input
                value={form.nationalId}
                onChange={(event) => setForm((current) => ({ ...current, nationalId: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>تاريخ الميلاد</span>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الجنس</span>
              <select
                value={form.gender}
                onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
              >
                <option value="MALE">{toArabicLabel("MALE")}</option>
                <option value="FEMALE">{toArabicLabel("FEMALE")}</option>
                <option value="OTHER">{toArabicLabel("OTHER")}</option>
                <option value="PREFER_NOT_TO_SAY">{toArabicLabel("PREFER_NOT_TO_SAY")}</option>
              </select>
            </label>
            <label className="field">
              <span>رقم الهاتف</span>
              <input
                value={form.primaryPhone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, primaryPhone: event.target.value }))
                }
              />
            </label>
            <label className="field field-span-2">
              <span>العنوان</span>
              <input
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>جهة اتصال الطوارئ</span>
              <input
                value={form.emergencyContact}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emergencyContact: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>فصيلة الدم</span>
              <input
                value={form.bloodType}
                onChange={(event) => setForm((current) => ({ ...current, bloodType: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الحساسيات</span>
              <input
                value={form.allergies}
                onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))}
                placeholder="افصل بين العناصر بفاصلة"
              />
            </label>
            <label className="field">
              <span>الأمراض المزمنة</span>
              <input
                value={form.chronicDiseases}
                onChange={(event) =>
                  setForm((current) => ({ ...current, chronicDiseases: event.target.value }))
                }
                placeholder="افصل بين العناصر بفاصلة"
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "جارٍ الحفظ..." : "حفظ التعديلات"}
              </button>
              <button
                className="danger-button"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
                type="button"
              >
                {isDeleting ? "جارٍ الحذف..." : "حذف الملف المحلي"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={bundle.patient.fullName}
        subtitle={joinMeta([
          bundle.patient.unifiedId ?? "سجل محلي",
          bundle.patient.nationalId ?? "بدون هوية",
          bundle.patient.phone
        ])}
      >
        <div className="detail-grid">
          <div className="detail-field">
            <span>تاريخ الميلاد</span>
            <strong>{formatDate(bundle.patient.dateOfBirth)}</strong>
          </div>
          <div className="detail-field">
            <span>الجنس</span>
            <strong>{toArabicLabel(bundle.patient.gender)}</strong>
          </div>
          <div className="detail-field">
            <span>فصيلة الدم</span>
            <strong>{bundle.patient.bloodType ?? "غير مسجلة"}</strong>
          </div>
          <div className="detail-field">
            <span>جهة اتصال الطوارئ</span>
            <strong>{bundle.patient.emergencyContact ?? "غير مسجلة"}</strong>
          </div>
          <div className="detail-field field-span-2">
            <span>العنوان</span>
            <strong>{bundle.patient.address}</strong>
          </div>
          <div className="detail-field field-span-2">
            <span>الأمراض المزمنة</span>
            <strong>{renderList(bundle.patient.chronicDiseases)}</strong>
          </div>
          <div className="detail-field field-span-2">
            <span>الحساسيات</span>
            <strong>{renderList(bundle.patient.allergies)}</strong>
          </div>
        </div>

        <div className="chip-row">
          {bundle.patient.centersSeenAt.map((center) => (
            <span key={center.centerId} className="tag">
              {center.centerName}
            </span>
          ))}
        </div>

        <div className="stats-strip">
          <div className="stat-pill">
            <strong>{bundle.patient.visitCount}</strong>
            <span>زيارات</span>
          </div>
          <div className="stat-pill">
            <strong>{bundle.patient.labResultsCount}</strong>
            <span>نتائج مختبر</span>
          </div>
          <div className="stat-pill">
            <strong>{bundle.patient.referralCount}</strong>
            <span>إحالات</span>
          </div>
          <div className="stat-pill">
            <strong>{bundle.patient.timelineCount}</strong>
            <span>أحداث طبية</span>
          </div>
        </div>

        <p className="muted">
          آخر تحديث ظاهر في السجل: {bundle.patient.lastEventAt ? formatDateTime(bundle.patient.lastEventAt) : "-"}
        </p>
      </SectionCard>

      <SectionCard title="أحدث الأحداث الطبية" subtitle="ملخص سريع لآخر ما سُجل على المريض قبل فتح السجل الزمني الكامل.">
        {previewEvents.length > 0 ? (
          <div className="stack-list">
            {previewEvents.map((event) => (
              <EventPreview key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">لا توجد أحداث طبية مسجلة لهذا المريض حتى الآن.</div>
        )}
      </SectionCard>
    </div>
  );
}
