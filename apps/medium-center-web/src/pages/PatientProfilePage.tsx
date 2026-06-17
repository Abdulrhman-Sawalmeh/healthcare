import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, apiDownload, apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { PatientLabTrend, PatientTimelineBundle, PatientTimelineEvent, PatientTimelineEventType } from "../types";

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

function isConsentRequiredError(cause: unknown) {
  if (!(cause instanceof ApiError)) {
    return false;
  }

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
        <span>{event.sourceTable}</span>
      </div>
    </article>
  );
}

function LabTrendChart({ trend }: { trend: PatientLabTrend }) {
  if (trend.points.length < 2) {
    return (
      <div className="empty-state compact">
        Not enough numeric lab history to draw a trend for this test.
      </div>
    );
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lab result trend chart">
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
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<PatientTimelineBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
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

  const canManage =
    user?.workspace === "center" &&
    (user.role === "CENTER_MANAGER" || user.role === "RECEPTIONIST");

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
        setConsentDenied(false);
      } catch (cause) {
        if (!isActive) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "تعذر تحميل ملف المريض.");
        setConsentDenied(isConsentRequiredError(cause));
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

  useEffect(() => {
    let isActive = true;

    async function loadLabTrend() {
      if (!patientId) {
        return;
      }

      try {
        setTrendLoading(true);
        setTrendError("");
        const query = selectedTrendTest ? `?testName=${encodeURIComponent(selectedTrendTest)}` : "";
        const payload = await apiRequest<PatientLabTrend>(`/patients/${patientId}/lab-trends${query}`);

        if (!isActive) {
          return;
        }

        setLabTrend(payload);
        if (!selectedTrendTest && payload.testName) {
          setSelectedTrendTest(payload.testName);
        }
      } catch (cause) {
        if (!isActive) {
          return;
        }

        setTrendError(cause instanceof Error ? cause.message : "Unable to load lab trends.");
      } finally {
        if (isActive) {
          setTrendLoading(false);
        }
      }
    }

    void loadLabTrend();

    return () => {
      isActive = false;
    };
  }, [patientId, selectedTrendTest]);

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
    setConsentDenied(false);
  }

  async function handleEmergencyAccess() {
    if (!patientId) {
      return;
    }

    if (emergencyReason.trim().length < 10) {
      setError("Enter a clear emergency reason before requesting access.");
      return;
    }

    try {
      setIsRequestingEmergency(true);
      setError("");
      await apiRequest(`/patients/${patientId}/emergency-access`, {
        method: "POST",
        body: JSON.stringify({
          reason: emergencyReason.trim()
        })
      });
      setSuccessMessage("Emergency access granted for one hour. This action was audited.");
      setEmergencyReason("");
      await reloadProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request emergency access.");
    } finally {
      setIsRequestingEmergency(false);
    }
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

  async function handleExportSummary() {
    if (!bundle) {
      return;
    }

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
      setSuccessMessage("Patient summary PDF was generated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to export patient summary.");
      setSuccessMessage("");
    } finally {
      setIsExporting(false);
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
        {consentDenied && user?.role === "DOCTOR" ? (
          <SectionCard
            title="Emergency Access"
            subtitle="This action will be audited and must only be used for emergency cases."
          >
            <label className="field field-span-2">
              <span>Emergency reason</span>
              <textarea
                value={emergencyReason}
                onChange={(event) => setEmergencyReason(event.target.value)}
                placeholder="Describe the clinical emergency that requires temporary access."
              />
            </label>
            <button
              className="danger-button"
              disabled={isRequestingEmergency}
              onClick={() => void handleEmergencyAccess()}
              type="button"
            >
              {isRequestingEmergency ? "Requesting..." : "Request Emergency Access"}
            </button>
          </SectionCard>
        ) : null}
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
          <button className="ghost-button" disabled={isExporting} onClick={() => void handleExportSummary()} type="button">
            {isExporting ? "Generating PDF..." : "Export Summary PDF"}
          </button>
          {user?.workspace === "center" ? (
            <Link className="ghost-button" to={`/patients/${bundle.patient.id}/card`}>
              بطاقة QR
            </Link>
          ) : null}
        </div>
      </div>

      {successMessage ? <div className="empty-state compact">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <SectionCard title="Lab Result Trends" subtitle="Track numeric lab results over time for this patient.">
        {trendError ? <div className="error-banner">{trendError}</div> : null}
        <div className="toolbar">
          <label className="field toolbar-input">
            <span>Test type</span>
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
                <option value="">No completed lab results</option>
              )}
            </select>
          </label>
          {labTrend?.normalRange ? <span className="tag">Normal range: {labTrend.normalRange}</span> : null}
        </div>
        {trendLoading ? (
          <div className="empty-state compact">Loading lab trend...</div>
        ) : labTrend ? (
          <LabTrendChart trend={labTrend} />
        ) : (
          <div className="empty-state compact">No lab trend data is available yet.</div>
        )}
      </SectionCard>

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
