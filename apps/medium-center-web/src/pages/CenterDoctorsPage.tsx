import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDate, joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterDoctorAccountRecord, CenterDoctorsBundle, WorkDay } from "../types";

type CreateDoctorResponse = {
  success: boolean;
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
  if (!doctor.profile) {
    return "لم تُسجل أوقات الدوام بعد.";
  }

  const days = doctor.profile.shiftDays.map((day) => workDays.find((item) => item.value === day)?.label ?? day);
  return `${days.join("، ")} | ${doctor.profile.shiftStartTime} - ${doctor.profile.shiftEndTime}`;
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
  const [deletingDoctorId, setDeletingDoctorId] = useState<number | null>(null);

  const canManage = user?.role === "CENTER_MANAGER";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingDoctorId ? `/center/doctors/${editingDoctorId}` : "/center/doctors";
    const method = editingDoctorId ? "PUT" : "POST";

    try {
      setSubmitting(true);
      const payload = await apiRequest<CreateDoctorResponse>(path, {
        method,
        body: JSON.stringify({
          username: form.username,
          ...(form.password ? { password: form.password } : {}),
          fullName: form.fullName,
          nationalId: form.nationalId,
          phone: form.phone,
          email: form.email || undefined,
          gender: form.gender,
          specialization: form.specialization,
          yearsExperience: Number(form.yearsExperience),
          licenseNumber: form.licenseNumber,
          qualification: form.qualification || undefined,
          shiftDays: form.shiftDays,
          shiftStartTime: form.shiftStartTime,
          shiftEndTime: form.shiftEndTime,
          consultationRoom: form.consultationRoom || undefined,
          hireDate: form.hireDate || undefined,
          bio: form.bio || undefined,
          notes: form.notes || undefined,
          isActive: form.isActive
        })
      });

      resetForm();
      await loadDoctors();
      setError("");
      setSuccessMessage(
        editingDoctorId
          ? `تم تحديث بيانات الطبيب ${payload.doctor.fullName}.`
          : `تم إنشاء حساب الطبيب ${payload.doctor.fullName}. اسم المستخدم: ${payload.credentials?.username}، وكلمة المرور المؤقتة: ${payload.credentials?.temporaryPassword}`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات الطبيب.");
      setSuccessMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(doctor: CenterDoctorAccountRecord) {
    if (!window.confirm(`هل تريد حذف حساب الطبيب ${doctor.fullName}؟`)) {
      return;
    }

    try {
      setDeletingDoctorId(doctor.id);
      await apiRequest(`/center/doctors/${doctor.id}`, {
        method: "DELETE"
      });
      if (editingDoctorId === doctor.id) {
        resetForm();
      }
      await loadDoctors();
      setError("");
      setSuccessMessage(`تم حذف حساب الطبيب ${doctor.fullName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف حساب الطبيب.");
      setSuccessMessage("");
    } finally {
      setDeletingDoctorId(null);
    }
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل ملف الأطباء المحلي...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">إدارة الأطباء</p>
          <h1>حسابات الأطباء المحليين</h1>
          <p className="muted">
            أنشئ الطبيب الجديد أو عدل بياناته أو عطّل حسابه من نفس الواجهة مع إبقاء التخصصات والتوافر محدثة.
          </p>
        </div>
        <div className="tile-stats">
          <span>{bundle?.doctors.length ?? 0} أطباء مسجلون</span>
          <span>{bundle?.center.specialties.length ?? 0} تخصصات مفعلة</span>
        </div>
      </section>

      {successMessage ? (
        <div className="credentials-banner">
          <strong>تم تنفيذ العملية</strong>
          <span>{successMessage}</span>
        </div>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        {canManage ? (
          <SectionCard
            title={editingDoctorId ? "تعديل بيانات طبيب" : "إضافة طبيب جديد"}
            subtitle={
              editingDoctorId
                ? "يمكنك تحديث الحساب والملف المهني للطبيب. اترك كلمة المرور فارغة إذا لم ترد تغييرها."
                : "أدخل بيانات الحساب والملف المهني للطبيب. ستُحدّث التخصصات والتوافر داخل المركز تلقائيًا."
            }
          >
            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>اسم المستخدم</span>
                <input
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="doctor.new"
                />
              </label>
              <label className="field">
                <span>{editingDoctorId ? "كلمة مرور جديدة" : "كلمة المرور المؤقتة"}</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
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
                <span>رقم الهاتف</span>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
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
                <span>التخصص</span>
                <input
                  list="center-doctor-specialties"
                  value={form.specialization}
                  onChange={(event) => setForm((current) => ({ ...current, specialization: event.target.value }))}
                  placeholder="اختر أو اكتب تخصصًا جديدًا"
                />
                <datalist id="center-doctor-specialties">
                  {bundle?.specialtyOptions.map((specialty) => <option key={specialty} value={specialty} />)}
                </datalist>
              </label>
              <label className="field">
                <span>سنوات الخبرة</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={form.yearsExperience}
                  onChange={(event) => setForm((current) => ({ ...current, yearsExperience: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>رقم الترخيص</span>
                <input
                  value={form.licenseNumber}
                  onChange={(event) => setForm((current) => ({ ...current, licenseNumber: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>المؤهل العلمي</span>
                <input
                  value={form.qualification}
                  onChange={(event) => setForm((current) => ({ ...current, qualification: event.target.value }))}
                  placeholder="بكالوريوس، بورد، زمالة..."
                />
              </label>
              <label className="field">
                <span>غرفة أو عيادة العمل</span>
                <input
                  value={form.consultationRoom}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, consultationRoom: event.target.value }))
                  }
                  placeholder="عيادة 3"
                />
              </label>
              <label className="field">
                <span>تاريخ المباشرة</span>
                <input
                  type="date"
                  value={form.hireDate}
                  onChange={(event) => setForm((current) => ({ ...current, hireDate: event.target.value }))}
                />
              </label>
              <label className="field field-span-2">
                <span>أيام الدوام</span>
                <div className="checkbox-grid">
                  {workDays.map((day) => (
                    <label key={day.value} className="checkbox-chip">
                      <input
                        type="checkbox"
                        checked={form.shiftDays.includes(day.value)}
                        onChange={() => toggleShiftDay(day.value)}
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="field">
                <span>بداية الدوام</span>
                <input
                  type="time"
                  value={form.shiftStartTime}
                  onChange={(event) => setForm((current) => ({ ...current, shiftStartTime: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>نهاية الدوام</span>
                <input
                  type="time"
                  value={form.shiftEndTime}
                  onChange={(event) => setForm((current) => ({ ...current, shiftEndTime: event.target.value }))}
                />
              </label>
              <label className="field field-span-2">
                <span>نبذة مهنية</span>
                <textarea
                  value={form.bio}
                  onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                  placeholder="تعريف مختصر بخبرة الطبيب واهتماماته السريرية."
                />
              </label>
              <label className="field field-span-2">
                <span>ملاحظات إدارية</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="أي بيانات تشغيلية إضافية يحتاجها المركز."
                />
              </label>
              <label className="checkbox-chip field-span-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <span>تفعيل الحساب</span>
              </label>
              <div className="field-span-2 button-row">
                <button className="primary-button" disabled={submitting} type="submit">
                  {submitting ? "جارٍ الحفظ..." : editingDoctorId ? "حفظ التعديلات" : "إنشاء حساب الطبيب"}
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
          <SectionCard
            title="إدارة الحسابات"
            subtitle="إنشاء حسابات الأطباء الجديدة متاح حاليًا لمدير المركز فقط."
          >
            <div className="empty-state compact">
              يمكنك مراجعة قائمة الأطباء وأوقات دوامهم، بينما تبقى إدارة الحسابات ضمن صلاحيات مدير المركز.
            </div>
          </SectionCard>
        )}

        <SectionCard
          title="التخصصات المتاحة"
          subtitle="أي تخصص جديد تضيفه هنا سيُضاف تلقائيًا إلى قائمة تخصصات المركز."
        >
          <div className="chip-row">
            {bundle?.specialtyOptions.map((specialty) => (
              <span key={specialty} className="tag">
                {specialty}
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="قائمة الأطباء المحليين"
        subtitle="الأطباء المرتبطون حاليًا بهذا المركز مع بيانات الدوام والتخصص والجاهزية."
      >
        <div className="card-grid">
          {bundle?.doctors.map((doctor) => (
            <article key={doctor.id} className="profile-tile">
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
                <span>{joinMeta([doctor.profile?.qualification ?? null, doctor.createdByName ? `أُنشئ بواسطة ${doctor.createdByName}` : null])}</span>
                <span>{joinMeta([doctor.profile?.hireDate ? `تاريخ المباشرة ${formatDate(doctor.profile.hireDate)}` : null, `أُضيف ${formatDate(doctor.createdAt)}`])}</span>
              </div>

              {doctor.profile?.shiftDays?.length ? (
                <div className="chip-row">
                  {doctor.profile.shiftDays.map((day) => (
                    <span key={`${doctor.id}-${day}`} className="tag">
                      {workDays.find((item) => item.value === day)?.label ?? day}
                    </span>
                  ))}
                </div>
              ) : null}

              {doctor.profile?.bio ? <p className="muted">{doctor.profile.bio}</p> : null}
              {doctor.profile?.notes ? <p className="muted">ملاحظات: {doctor.profile.notes}</p> : null}

              {canManage ? (
                <div className="button-row">
                  <button className="ghost-button" onClick={() => startEditing(doctor)} type="button">
                    تعديل
                  </button>
                  <button
                    className="danger-button"
                    disabled={deletingDoctorId === doctor.id}
                    onClick={() => void handleDelete(doctor)}
                    type="button"
                  >
                    {deletingDoctorId === doctor.id ? "جارٍ الحذف..." : "حذف"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {bundle && bundle.doctors.length === 0 ? (
            <div className="empty-state">لا يوجد أطباء محليون مسجلون بعد في هذا المركز.</div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
