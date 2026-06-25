import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError, apiDownload, apiRequest } from "../api/client";
import { DemoPatientLoginButton } from "../components/DemoPatientLoginButton";
import { SectionCard } from "../components/SectionCard";
import { Breadcrumbs, EmptyState, LoadingState, PageHeader } from "../components/UiStates";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PatientLabTrend, PatientTimelineBundle, PatientTimelineEvent, PatientTimelineEventType } from "../types";

const eventConfig: Record<PatientTimelineEventType, { label: string; marker: string; tone: string }> = {
  refill_request: { label: "تجديد دواء", marker: "د", tone: "prescription" },
  follow_up: { label: "متابعة", marker: "م", tone: "appointment" },
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

const bloodTypeOptions = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function renderList(value: string[]) {
  return value.length > 0 ? value.join("، ") : "لا توجد بيانات مسجلة";
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isFutureDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return !Number.isNaN(date.getTime()) && date > today;
}

function isConsentRequiredError(cause: unknown) {
  if (!(cause instanceof ApiError)) return false;

  const payload = cause.payload as { code?: string } | undefined;
  return payload?.code === "CONSENT_REQUIRED";
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
        <span>{toArabicLabel(event.sourceTable)}</span>
      </div>
    </article>
  );
}

function LabTrendChart({ trend }: { trend: PatientLabTrend }) {
  if (trend.points.length < 2) {
    return <EmptyState title="لا توجد نقاط كافية" description="يحتاج الرسم إلى نتيجتين رقميتين على الأقل لنفس الفحص." />;
  }

  const width = 680;
  const height = 240;
  const padding = 34;
  const values = trend.points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue === minValue ? 1 : maxValue - minValue;
  const path = trend.points
    .map((point, index) => {
      const x = padding + (index / Math.max(trend.points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="lab-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="رسم تغير نتائج المختبر">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <path d={path} />
        {trend.points.map((point, index) => {
          const x = padding + (index / Math.max(trend.points.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2);

          return (
            <circle key={`${point.date}-${index}`} cx={x} cy={y} r="4">
              <title>{`${formatDate(point.date)}: ${point.rawValue ?? point.value}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="lab-trend-meta">
        <span>{formatDate(trend.points[0].date)}</span>
        <strong>
          {minValue} - {maxValue}
          {trend.unit ? ` ${trend.unit}` : ""}
        </strong>
        <span>{formatDate(trend.points[trend.points.length - 1].date)}</span>
      </div>
    </div>
  );
}

export function PatientProfilePage() {
  const { user } = useAuth();
  const { patientId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<PatientTimelineBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isEditing, setIsEditing] = useState(searchParams.get("mode") === "edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [labTrend, setLabTrend] = useState<PatientLabTrend | null>(null);
  const [selectedTrendTest, setSelectedTrendTest] = useState("");
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState("");
  const [consentDenied, setConsentDenied] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [isRequestingEmergency, setIsRequestingEmergency] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const canEditPatient = user?.workspace === "center" && user.role === "RECEPTIONIST";
  const isManager = user?.workspace === "center" && user.role === "CENTER_MANAGER";

  async function reloadProfile() {
    if (!patientId) return;

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
    setConsentDenied(false);
  }

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      if (!patientId) {
        setError("تعذر تحديد المريض المطلوب.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const payload = await apiRequest<PatientTimelineBundle>(`/patients/${patientId}/timeline`);

        if (!isActive) return;

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
        setConsentDenied(false);
      } catch (cause) {
        if (!isActive) return;

        setError(cause instanceof Error ? cause.message : "تعذر تحميل ملف المريض.");
        setConsentDenied(isConsentRequiredError(cause));
      } finally {
        if (isActive) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [patientId]);

  useEffect(() => {
    let isActive = true;

    async function loadLabTrend() {
      if (!patientId || (bundle && bundle.patient.labResultsCount === 0)) return;

      try {
        setTrendLoading(true);
        setTrendError("");
        const query = selectedTrendTest ? `?testName=${encodeURIComponent(selectedTrendTest)}` : "";
        const payload = await apiRequest<PatientLabTrend>(`/patients/${patientId}/lab-trends${query}`);

        if (!isActive) return;

        setLabTrend(payload);
        if (!selectedTrendTest && payload.testName) {
          setSelectedTrendTest(payload.testName);
        }
      } catch (cause) {
        if (isActive) setTrendError(cause instanceof Error ? cause.message : "تعذر تحميل اتجاهات المختبر.");
      } finally {
        if (isActive) setTrendLoading(false);
      }
    }

    void loadLabTrend();

    return () => {
      isActive = false;
    };
  }, [bundle, patientId, selectedTrendTest]);

  async function handleEmergencyAccess() {
    if (!patientId) return;

    if (emergencyReason.trim().length < 10) {
      setError("اكتب سبب طوارئ واضحا قبل طلب الوصول.");
      return;
    }

    try {
      setIsRequestingEmergency(true);
      setError("");
      await apiRequest(`/patients/${patientId}/emergency-access`, {
        method: "POST",
        body: JSON.stringify({ reason: emergencyReason.trim() })
      });
      setSuccessMessage("تم منح الوصول الطارئ لمدة ساعة واحدة، وتم تسجيل العملية في التدقيق.");
      setEmergencyReason("");
      await reloadProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر طلب الوصول الطارئ.");
    } finally {
      setIsRequestingEmergency(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!bundle || !canEditPatient) return;

    if (isFutureDate(form.dateOfBirth)) {
      setError("تاريخ الميلاد لا يمكن أن يكون في المستقبل.");
      setSuccessMessage("");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiRequest(`/center/patients/${bundle.patient.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          nationalId: form.nationalId.trim() || undefined,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          primaryPhone: form.primaryPhone.trim(),
          address: form.address.trim(),
          emergencyContact: form.emergencyContact.trim() || undefined,
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
    if (
      !bundle ||
      !canEditPatient ||
      !window.confirm("سيتم حذف الملف المحلي فقط إذا لم يكن مرتبطا بزيارات أو نتائج. هل تريد المتابعة؟")
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiRequest(`/center/patients/${bundle.patient.id}`, { method: "DELETE" });
      navigate("/patients");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف ملف المريض.");
      setSuccessMessage("");
      setIsDeleting(false);
    }
  }

  async function handleExportSummary() {
    if (!bundle) return;

    try {
      setIsExporting(true);
      setError("");
      const blob = await apiDownload(`/patients/${bundle.patient.id}/summary/export`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `patient-${bundle.patient.id}-summary.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccessMessage("تم إنشاء ملف PDF لملخص المريض.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تصدير ملخص المريض.");
      setSuccessMessage("");
    } finally {
      setIsExporting(false);
    }
  }

  if (loading) {
    return <LoadingState text="جاري تحميل ملف المريض..." />;
  }

  if (error && !bundle) {
    return (
      <div className="page-stack">
        <Link className="action-hint" to="/patients">
          العودة إلى قائمة المرضى
        </Link>
        <div className="error-banner">{error}</div>
        {consentDenied && user?.role === "DOCTOR" ? (
          <SectionCard title="وصول طارئ" subtitle="يستخدم فقط للحالات الطبية الطارئة ويتم تسجيله في التدقيق.">
            <label className="field field-span-2">
              <span>سبب الوصول الطارئ</span>
              <textarea
                value={emergencyReason}
                onChange={(event) => setEmergencyReason(event.target.value)}
                placeholder="صف الحالة الطبية التي تتطلب وصولا مؤقتا إلى السجل."
              />
            </label>
            <button className="danger-button" disabled={isRequestingEmergency} onClick={() => void handleEmergencyAccess()} type="button">
              {isRequestingEmergency ? "جاري الطلب..." : "طلب الوصول الطارئ"}
            </button>
          </SectionCard>
        ) : null}
      </div>
    );
  }

  if (!bundle) return null;

  const previewEvents = bundle.events.slice(0, 4);
  const showLabTrends = bundle.patient.labResultsCount > 0;

  return (
    <div className="page-stack">
      <Breadcrumbs items={[{ label: "المرضى", to: "/patients" }, { label: bundle.patient.fullName }]} />
      <PageHeader
        eyebrow="ملف المريض"
        title={bundle.patient.fullName}
        subtitle={joinMeta([bundle.patient.unifiedId ?? "سجل محلي", bundle.patient.nationalId ?? "بدون هوية", bundle.patient.phone])}
        actions={
          <div className="button-row">
            {canEditPatient ? (
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
            <button className="ghost-button" disabled={isExporting} onClick={() => void handleExportSummary()} type="button">
              {isExporting ? "جاري إنشاء PDF..." : "تصدير PDF"}
            </button>
            {user?.workspace === "center" ? (
              <Link className="ghost-button" to={`/patients/${bundle.patient.id}/card`}>
                بطاقة QR
              </Link>
            ) : null}
            <DemoPatientLoginButton patientId={bundle.patient.id} />
          </div>
        }
      />

      {isManager ? (
        <div className="inline-note">مدير المركز يستطيع عرض الملف ومتابعة الحالة. تعديل بيانات الحساب من صلاحية الاستقبال.</div>
      ) : null}
      {successMessage ? <div className="success-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {canEditPatient && isEditing ? (
        <SectionCard title="تعديل بيانات المريض" subtitle="تعديل البيانات الأساسية من صلاحية الاستقبال.">
          <form className="form-grid" onSubmit={handleUpdate}>
            <label className="field">
              <span>الاسم الكامل</span>
              <input required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
            </label>
            <label className="field">
              <span>رقم الهوية</span>
              <input value={form.nationalId} onChange={(event) => setForm((current) => ({ ...current, nationalId: event.target.value }))} />
            </label>
            <label className="field">
              <span>تاريخ الميلاد</span>
              <input
                required
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.dateOfBirth}
                onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))}
              />
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
            <label className="field">
              <span>رقم الهاتف</span>
              <input required value={form.primaryPhone} onChange={(event) => setForm((current) => ({ ...current, primaryPhone: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>العنوان</span>
              <input required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label className="field">
              <span>جهة اتصال الطوارئ</span>
              <input value={form.emergencyContact} onChange={(event) => setForm((current) => ({ ...current, emergencyContact: event.target.value }))} />
            </label>
            <label className="field">
              <span>فصيلة الدم</span>
              <select value={form.bloodType} onChange={(event) => setForm((current) => ({ ...current, bloodType: event.target.value }))}>
                <option value="">غير مسجلة</option>
                {bloodTypeOptions.filter(Boolean).map((bloodType) => (
                  <option key={bloodType} value={bloodType}>
                    {bloodType}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الحساسيات</span>
              <input value={form.allergies} onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))} placeholder="افصل بين العناصر بفاصلة" />
            </label>
            <label className="field">
              <span>الأمراض المزمنة</span>
              <input
                value={form.chronicDiseases}
                onChange={(event) => setForm((current) => ({ ...current, chronicDiseases: event.target.value }))}
                placeholder="افصل بين العناصر بفاصلة"
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
              <button className="danger-button" disabled={isDeleting} onClick={() => void handleDelete()} type="button">
                {isDeleting ? "جاري الحذف..." : "حذف الملف المحلي"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="البيانات الأساسية" subtitle="معلومات تعريفية وإدارية لا تتضمن قرارات تشخيصية جديدة من المدير.">
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

        <p className="muted">آخر تحديث ظاهر في السجل: {bundle.patient.lastEventAt ? formatDateTime(bundle.patient.lastEventAt) : "غير متاح"}</p>
      </SectionCard>

      {showLabTrends ? (
        <SectionCard title="اتجاهات نتائج المختبر" subtitle="رسم مختصر للنتائج الرقمية، ضمن قسم المختبر في ملف المريض.">
          {trendError ? <div className="error-banner">{trendError}</div> : null}
          <div className="toolbar">
            <label className="field toolbar-input">
              <span>نوع الفحص</span>
              <select
                disabled={!labTrend || labTrend.availableTests.length === 0}
                value={selectedTrendTest}
                onChange={(event) => setSelectedTrendTest(event.target.value)}
              >
                {labTrend?.availableTests.length ? (
                  labTrend.availableTests.map((test: string) => (
                    <option key={test} value={test}>
                      {test}
                    </option>
                  ))
                ) : (
                  <option value="">لا توجد نتائج مكتملة</option>
                )}
              </select>
            </label>
            {labTrend?.normalRange ? <span className="tag">المدى الطبيعي: {labTrend.normalRange}</span> : null}
          </div>
          {trendLoading ? <LoadingState text="جاري تحميل اتجاه المختبر..." /> : labTrend ? <LabTrendChart trend={labTrend} /> : <EmptyState title="لا توجد بيانات اتجاه" />}
        </SectionCard>
      ) : null}

      <SectionCard title="أحدث الأحداث الطبية" subtitle="ملخص سريع قبل فتح السجل الزمني الكامل.">
        {previewEvents.length > 0 ? (
          <div className="stack-list">
            {previewEvents.map((event) => (
              <EventPreview key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState title="لا توجد أحداث طبية" description="لم تسجل زيارات أو إحالات أو نتائج لهذا المريض حتى الآن." />
        )}
      </SectionCard>
    </div>
  );
}
