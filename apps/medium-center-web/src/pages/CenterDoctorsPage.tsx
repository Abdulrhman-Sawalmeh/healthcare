import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDate, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterDoctorAccountRecord, CenterDoctorsBundle, WorkDay } from "../types";

type CreateDoctorResponse = {
  success: boolean;
  emailDeliveryMethod?: "BREVO_API" | "SMTP" | "WEBHOOK" | "OUTBOX" | "SKIPPED";
  credentials?: {
    username: string;
    temporaryPassword: string;
  };
  doctor: CenterDoctorAccountRecord;
};

const workDays: Array<{ value: WorkDay; label: string }> = [
  { value: "SUNDAY", label: "الأحد" },
  { value: "MONDAY", label: "الاثنين" },
  { value: "TUESDAY", label: "الثلاثاء" },
  { value: "WEDNESDAY", label: "الأربعاء" },
  { value: "THURSDAY", label: "الخميس" },
  { value: "FRIDAY", label: "الجمعة" },
  { value: "SATURDAY", label: "السبت" }
];

const defaultForm = {
  username: "",
  password: "",
  fullName: "",
  nationalId: "",
  phone: "",
  email: "",
  gender: "PREFER_NOT_TO_SAY",
  specialization: "",
  yearsExperience: "0",
  licenseNumber: "",
  qualification: "",
  shiftDays: [] as WorkDay[],
  shiftStartTime: "08:00",
  shiftEndTime: "14:00",
  consultationRoom: "",
  hireDate: "",
  bio: "",
  notes: "",
  isActive: true
};

function formatShiftSummary(doctor: CenterDoctorAccountRecord) {
  if (!doctor.profile?.shiftDays.length) {
    return "لم تسجل أيام الدوام بعد.";
  }

  const days = doctor.profile.shiftDays.map((day) => workDays.find((item) => item.value === day)?.label ?? day);
  return `${days.join("، ")} | ${doctor.profile.shiftStartTime ?? "--:--"} - ${doctor.profile.shiftEndTime ?? "--:--"}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function generateTempPassword() {
  const random = Math.random().toString(36).slice(2, 8);
  return `Doc-${random}-2026!`;
}

export function CenterDoctorsPage() {
  const { user } = useAuth();
  const [bundle, setBundle] = useState<CenterDoctorsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingDoctorId, setEditingDoctorId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disablingDoctorId, setDisablingDoctorId] = useState<number | null>(null);

  const canManage = user?.role === "CENTER_MANAGER";
  const activeDoctors = useMemo(() => bundle?.doctors.filter((doctor) => doctor.isActive).length ?? 0, [bundle]);

  async function loadDoctors() {
    const payload = await apiRequest<CenterDoctorsBundle>("/center/doctors");
    setBundle(payload);
  }

  useEffect(() => {
    loadDoctors()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setForm(defaultForm);
    setEditingDoctorId(null);
  }

  function setNationalId(value: string) {
    setForm((current) => ({
      ...current,
      nationalId: value,
      username: current.username ? current.username : value
    }));
  }

  function toggleShiftDay(day: WorkDay) {
    setForm((current) => ({
      ...current,
      shiftDays: current.shiftDays.includes(day)
        ? current.shiftDays.filter((item) => item !== day)
        : [...current.shiftDays, day]
    }));
  }

  function startEditing(doctor: CenterDoctorAccountRecord) {
    setEditingDoctorId(doctor.id);
    setForm({
      username: doctor.username,
      password: "",
      fullName: doctor.fullName,
      nationalId: doctor.profile?.nationalId ?? "",
      phone: doctor.phone ?? "",
      email: doctor.email ?? "",
      gender: doctor.profile?.gender ?? "PREFER_NOT_TO_SAY",
      specialization: doctor.profile?.specialization ?? "",
      yearsExperience: String(doctor.profile?.yearsExperience ?? 0),
      licenseNumber: doctor.profile?.licenseNumber ?? "",
      qualification: doctor.profile?.qualification ?? "",
      shiftDays: doctor.profile?.shiftDays ?? [],
      shiftStartTime: doctor.profile?.shiftStartTime ?? "08:00",
      shiftEndTime: doctor.profile?.shiftEndTime ?? "14:00",
      consultationRoom: doctor.profile?.consultationRoom ?? "",
      hireDate: doctor.profile?.hireDate?.slice(0, 10) ?? "",
      bio: doctor.profile?.bio ?? "",
      notes: doctor.profile?.notes ?? "",
      isActive: doctor.isActive
    });
    setError("");
    setSuccessMessage("");
  }

  function validateForm() {
    if (!form.username.trim()) return "رقم الهوية / اسم الدخول مطلوب.";
    if (!/^[\p{L}\p{N}._@-]+$/u.test(form.username.trim())) return "اسم الدخول يحتوي على رموز غير مسموحة.";
    if (!form.fullName.trim()) return "الاسم الكامل مطلوب.";
    if (form.nationalId.trim().length < 4) return "رقم الهوية قصير جدا.";
    if (form.phone.trim().length < 5) return "رقم الهاتف غير صالح.";
    if (!isValidEmail(form.email)) return "البريد الإلكتروني مطلوب وصالح لاستعادة كلمة المرور.";
    if (!form.specialization || form.specialization === "بدون تخصص") return "اختر تخصصا من القائمة المرجعية.";
    if (!form.licenseNumber.trim()) return "رقم الترخيص مطلوب.";
    if (!editingDoctorId && form.password.length < 8) return "كلمة المرور المؤقتة يجب ألا تقل عن 8 خانات.";
    if (editingDoctorId && form.password && form.password.length < 8) return "كلمة المرور الجديدة يجب ألا تقل عن 8 خانات.";

    const duplicate = bundle?.doctors.find((doctor) => {
      if (doctor.id === editingDoctorId) return false;
      return (
        doctor.username.toLowerCase() === form.username.trim().toLowerCase() ||
        doctor.email?.toLowerCase() === form.email.trim().toLowerCase() ||
        doctor.profile?.nationalId === form.nationalId.trim() ||
        doctor.profile?.licenseNumber.toLowerCase() === form.licenseNumber.trim().toLowerCase()
      );
    });

    if (duplicate) return `يوجد تعارض مع حساب الطبيب ${duplicate.fullName}.`;
    return "";
  }

  async function copyCredentials(username: string, password?: string) {
    if (!password) return;

    try {
      await navigator.clipboard.writeText(`اسم الدخول: ${username}\nكلمة المرور المؤقتة: ${password}`);
      setSuccessMessage("تم نسخ بيانات الدخول المؤقتة.");
    } catch {
      setSuccessMessage(`اسم الدخول: ${username} | كلمة المرور المؤقتة: ${password}`);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      setSuccessMessage("");
      return;
    }

    const path = editingDoctorId ? `/center/doctors/${editingDoctorId}` : "/center/doctors";
    const method = editingDoctorId ? "PUT" : "POST";

    try {
      setSubmitting(true);
      const payload = await apiRequest<CreateDoctorResponse>(path, {
        method,
        body: JSON.stringify({
          username: form.username.trim(),
          ...(form.password ? { password: form.password } : {}),
          fullName: form.fullName.trim(),
          nationalId: form.nationalId.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          gender: form.gender,
          specialization: form.specialization,
          yearsExperience: Number(form.yearsExperience),
          licenseNumber: form.licenseNumber.trim(),
          qualification: form.qualification.trim() || undefined,
          shiftDays: form.shiftDays,
          shiftStartTime: form.shiftStartTime,
          shiftEndTime: form.shiftEndTime,
          consultationRoom: form.consultationRoom.trim() || undefined,
          hireDate: form.hireDate || undefined,
          bio: form.bio.trim() || undefined,
          notes: form.notes.trim() || undefined,
          isActive: form.isActive
        })
      });

      resetForm();
      await loadDoctors();
      setError("");
      const emailDeliveryNote =
        !editingDoctorId && payload.emailDeliveryMethod && payload.emailDeliveryMethod !== "SKIPPED"
          ? payload.emailDeliveryMethod === "OUTBOX"
            ? " تم حفظ رسالة البريد في سجل البريد المحلي."
            : " تم إرسال بيانات الدخول إلى بريد الطبيب."
          : "";
      setSuccessMessage(
        editingDoctorId
          ? `تم تحديث بيانات الطبيب ${payload.doctor.fullName}.`
          : `تم إنشاء حساب الطبيب ${payload.doctor.fullName}. اسم الدخول: ${payload.credentials?.username}، كلمة المرور المؤقتة: ${payload.credentials?.temporaryPassword}.${emailDeliveryNote}`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات الطبيب.");
      setSuccessMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  async function disableDoctor(doctor: CenterDoctorAccountRecord) {
    if (!window.confirm(`سيتم تعطيل حساب الطبيب ${doctor.fullName} مع إبقاء الزيارات والتقارير محفوظة. هل تريد المتابعة؟`)) {
      return;
    }

    try {
      setDisablingDoctorId(doctor.id);
      await apiRequest(`/center/doctors/${doctor.id}`, { method: "DELETE" });
      if (editingDoctorId === doctor.id) resetForm();
      await loadDoctors();
      setError("");
      setSuccessMessage(`تم تعطيل حساب الطبيب ${doctor.fullName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تعطيل حساب الطبيب.");
      setSuccessMessage("");
    } finally {
      setDisablingDoctorId(null);
    }
  }

  if (loading) {
    return <div className="screen-center">جاري تحميل ملف الأطباء المحلي...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">إدارة الأطباء</p>
          <h1>حسابات الأطباء المحليين</h1>
          <p className="muted">
            ينشئ مدير المركز حسابات الأطباء، يربطها بتخصصات مرجعية، ويحافظ على بيانات الدوام والترخيص بدون تغيير معرف الدخول الذي يدخله.
          </p>
        </div>
        <div className="tile-stats">
          <span>{bundle?.doctors.length ?? 0} أطباء مسجلون</span>
          <span>{activeDoctors} حسابات نشطة</span>
          <span>{bundle?.center.specialties.length ?? 0} تخصصات مفعلة</span>
        </div>
      </section>

      {successMessage ? <div className="success-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <SectionCard title="التخصصات المرجعية" subtitle="اختيار التخصص يتم من هذه القائمة فقط، ولا يسمح بحفظ طبيب بدون تخصص.">
        <div className="chip-row compact-tags">
          {bundle?.specialtyOptions.map((specialty) => (
            <span key={specialty} className="tag">{specialty}</span>
          ))}
        </div>
      </SectionCard>

      {canManage ? (
        <SectionCard
          title={editingDoctorId ? "تعديل بيانات طبيب" : "إضافة طبيب جديد"}
          subtitle={editingDoctorId ? "اترك كلمة المرور فارغة إذا لم ترغب بتغييرها." : "يمكن توليد كلمة مرور مؤقتة ثم نسخ بيانات الدخول للطبيب."}
        >
          <form className="form-grid doctor-form" onSubmit={handleSubmit}>
            <fieldset className="form-section field-span-2">
              <legend>بيانات الحساب</legend>
              <div className="form-grid">
                <label className="field">
                  <span>رقم الهوية / اسم الدخول</span>
                  <input
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="مثال: 401234567"
                  />
                </label>
                <label className="field">
                  <span>{editingDoctorId ? "كلمة مرور جديدة" : "كلمة المرور المؤقتة"}</span>
                  <div className="password-input-wrap">
                    <input
                      type="text"
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingDoctorId ? "اتركها فارغة إن لم تتغير" : "Doc-xxxx-2026!"}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>البريد الإلكتروني</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="doctor@example.com"
                  />
                </label>
                <div className="button-row field">
                  <span>أدوات كلمة المرور</span>
                  <button className="ghost-button" type="button" onClick={() => setForm((current) => ({ ...current, password: generateTempPassword() }))}>
                    توليد مؤقتة
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void copyCredentials(form.username, form.password)}>
                    نسخ
                  </button>
                </div>
              </div>
            </fieldset>

            <fieldset className="form-section field-span-2">
              <legend>البيانات الشخصية</legend>
              <div className="form-grid">
                <label className="field">
                  <span>الاسم الكامل</span>
                  <input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
                </label>
                <label className="field">
                  <span>رقم الهوية</span>
                  <input value={form.nationalId} onChange={(event) => setNationalId(event.target.value)} />
                </label>
                <label className="field">
                  <span>رقم الهاتف</span>
                  <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="field">
                  <span>الجنس</span>
                  <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}>
                    <option value="MALE">{toArabicLabel("MALE")}</option>
                    <option value="FEMALE">{toArabicLabel("FEMALE")}</option>
                    <option value="OTHER">{toArabicLabel("OTHER")}</option>
                    <option value="PREFER_NOT_TO_SAY">{toArabicLabel("PREFER_NOT_TO_SAY")}</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="form-section field-span-2">
              <legend>التخصص والترخيص</legend>
              <div className="form-grid">
                <label className="field">
                  <span>التخصص</span>
                  <select value={form.specialization} onChange={(event) => setForm((current) => ({ ...current, specialization: event.target.value }))}>
                    <option value="">اختر التخصص</option>
                    {bundle?.specialtyOptions.map((specialty) => (
                      <option key={specialty} value={specialty}>{specialty}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>سنوات الخبرة</span>
                  <input type="number" min="0" max="60" value={form.yearsExperience} onChange={(event) => setForm((current) => ({ ...current, yearsExperience: event.target.value }))} />
                </label>
                <label className="field">
                  <span>رقم الترخيص</span>
                  <input value={form.licenseNumber} onChange={(event) => setForm((current) => ({ ...current, licenseNumber: event.target.value }))} />
                </label>
                <label className="field">
                  <span>المؤهل العلمي</span>
                  <input value={form.qualification} onChange={(event) => setForm((current) => ({ ...current, qualification: event.target.value }))} />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-section field-span-2">
              <legend>جدول الدوام</legend>
              <div className="form-grid">
                <label className="field field-span-2">
                  <span>أيام الدوام</span>
                  <div className="checkbox-grid day-chip-grid">
                    {workDays.map((day) => (
                      <label key={day.value} className={`checkbox-chip ${form.shiftDays.includes(day.value) ? "is-selected" : ""}`}>
                        <input type="checkbox" checked={form.shiftDays.includes(day.value)} onChange={() => toggleShiftDay(day.value)} />
                        <span>{day.label}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>بداية الدوام</span>
                  <input type="time" value={form.shiftStartTime} onChange={(event) => setForm((current) => ({ ...current, shiftStartTime: event.target.value }))} />
                </label>
                <label className="field">
                  <span>نهاية الدوام</span>
                  <input type="time" value={form.shiftEndTime} onChange={(event) => setForm((current) => ({ ...current, shiftEndTime: event.target.value }))} />
                </label>
                <label className="field">
                  <span>غرفة أو عيادة العمل</span>
                  <input value={form.consultationRoom} onChange={(event) => setForm((current) => ({ ...current, consultationRoom: event.target.value }))} />
                </label>
                <label className="field">
                  <span>تاريخ المباشرة</span>
                  <input type="date" value={form.hireDate} onChange={(event) => setForm((current) => ({ ...current, hireDate: event.target.value }))} />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-section field-span-2">
              <legend>ملاحظات إدارية</legend>
              <div className="form-grid">
                <label className="field field-span-2">
                  <span>نبذة مهنية</span>
                  <textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} />
                </label>
                <label className="field field-span-2">
                  <span>ملاحظات إدارية</span>
                  <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <label className="checkbox-chip field-span-2">
                  <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  <span>الحساب نشط</span>
                </label>
              </div>
            </fieldset>

            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={submitting} type="submit">
                {submitting ? "جاري الحفظ..." : editingDoctorId ? "حفظ التعديلات" : "إنشاء حساب الطبيب"}
              </button>
              {editingDoctorId ? (
                <button className="ghost-button" onClick={resetForm} type="button">
                  إلغاء التعديل
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      ) : (
        <SectionCard title="إدارة الحسابات" subtitle="إنشاء وتعديل حسابات الأطباء متاح لمدير المركز فقط.">
          <div className="empty-state compact">يمكنك مراجعة قائمة الأطباء وأوقات دوامهم، بينما تبقى إدارة الحسابات ضمن صلاحيات مدير المركز.</div>
        </SectionCard>
      )}

      <SectionCard title="قائمة الأطباء المحليين" subtitle="الأطباء المرتبطون بالمركز مع التخصص، الدوام، وحالة الحساب.">
        <div className="doctor-list-grid">
          {bundle?.doctors.map((doctor) => (
            <article key={doctor.id} className="profile-tile doctor-card">
              <div className="info-row">
                <div>
                  <p className="eyebrow">{doctor.username}</p>
                  <h3>{doctor.fullName}</h3>
                </div>
                <StatusBadge status={doctor.isActive ? "active" : "inactive"} />
              </div>

              <p>{joinMeta([doctor.profile?.specialization ?? "بدون تخصص", doctor.profile?.licenseNumber, doctor.phone])}</p>
              <div className="tile-stats">
                <span>{doctor.profile?.yearsExperience ?? 0} سنوات خبرة</span>
                <span>{doctor.email ?? "لا يوجد بريد إلكتروني"}</span>
                <span>{doctor.profile?.consultationRoom ?? "بدون غرفة محددة"}</span>
              </div>
              <div className="profile-meta">
                <span>{formatShiftSummary(doctor)}</span>
                <span>{joinMeta([doctor.profile?.qualification ?? null, doctor.createdByName ? `أضيف بواسطة ${doctor.createdByName}` : null])}</span>
                <span>{joinMeta([doctor.profile?.hireDate ? `تاريخ المباشرة ${formatDate(doctor.profile.hireDate)}` : null, `أضيف ${formatDate(doctor.createdAt)}`])}</span>
              </div>
              {doctor.profile?.shiftDays?.length ? (
                <div className="chip-row">
                  {doctor.profile.shiftDays.map((day) => (
                    <span key={`${doctor.id}-${day}`} className="tag">{workDays.find((item) => item.value === day)?.label ?? day}</span>
                  ))}
                </div>
              ) : null}
              {doctor.profile?.bio ? <p className="muted">{doctor.profile.bio}</p> : null}
              {doctor.profile?.notes ? <p className="muted">ملاحظات: {doctor.profile.notes}</p> : null}

              {canManage ? (
                <div className="button-row">
                  <button className="ghost-button" onClick={() => startEditing(doctor)} type="button">تعديل</button>
                  {doctor.isActive ? (
                    <button className="danger-button" disabled={disablingDoctorId === doctor.id} onClick={() => void disableDoctor(doctor)} type="button">
                      {disablingDoctorId === doctor.id ? "جاري التعطيل..." : "تعطيل الحساب"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {bundle && bundle.doctors.length === 0 ? <div className="empty-state">لا يوجد أطباء محليون مسجلون بعد في هذا المركز.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}
