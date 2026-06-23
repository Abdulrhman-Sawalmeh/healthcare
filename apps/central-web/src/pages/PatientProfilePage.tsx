import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { cleanDemoText, formatCount, formatDate, formatDateTime, joinMeta, safeDisplay, toArabicLabel } from "../lib/arabic";
import { PatientTimelineBundle, PatientTimelineEvent, PatientTimelineEventType } from "../types";

type PatientTab =
  | "basic"
  | "visits"
  | "referrals"
  | "diagnoses"
  | "prescriptions"
  | "conditions"
  | "files"
  | "timeline";

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

const tabs: Array<{ value: PatientTab; label: string }> = [
  { value: "basic", label: "البيانات الأساسية" },
  { value: "visits", label: "الزيارات" },
  { value: "referrals", label: "الإحالات" },
  { value: "diagnoses", label: "التشخيصات" },
  { value: "prescriptions", label: "الأدوية والوصفات" },
  { value: "conditions", label: "الحساسية والأمراض المزمنة" },
  { value: "files", label: "الملفات/التقارير" },
  { value: "timeline", label: "السجل الزمني" }
];

function renderList(value: string[]) {
  const cleanValues = value.filter((item) => !/^[?\s]+$/.test(item.trim()));
  return cleanValues.length > 0 ? cleanValues.join("، ") : "لا توجد بيانات مسجلة";
}

function EventPreview({ event }: { event: PatientTimelineEvent }) {
  const config = eventConfig[event.type];

  return (
    <article className="timeline-preview-card">
      <div className="timeline-preview-top">
        <div className={`timeline-mini-icon ${config.tone}`}>{config.marker}</div>
        <div>
          <p className="eyebrow">{config.label}</p>
          <h4>{safeDisplay(event.title)}</h4>
        </div>
      </div>
      <p>{cleanDemoText(event.description)}</p>
      <div className="timeline-meta">
        <span>{formatDateTime(event.date)}</span>
        <span>{safeDisplay(event.createdBy)}</span>
        <span>{safeDisplay(event.sourceTable)}</span>
      </div>
    </article>
  );
}

function EventList({ events, emptyText }: { events: PatientTimelineEvent[]; emptyText: string }) {
  if (events.length === 0) {
    return <div className="empty-state compact">{emptyText}</div>;
  }

  return (
    <div className="stack-list">
      {events.map((event) => (
        <EventPreview key={event.id} event={event} />
      ))}
    </div>
  );
}

export function PatientProfilePage() {
  const { patientId } = useParams();
  const [bundle, setBundle] = useState<PatientTimelineBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<PatientTab>("basic");

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

  const groupedEvents = useMemo(() => {
    const events = bundle?.events ?? [];
    return {
      visits: events.filter((event) => event.type === "appointment" || event.type === "diagnosis"),
      referrals: events.filter((event) => event.type === "referral"),
      diagnoses: events.filter((event) => event.type === "diagnosis"),
      prescriptions: events.filter((event) => event.type === "prescription"),
      files: events.filter((event) => event.type === "lab_result"),
      timeline: events
    };
  }, [bundle]);

  if (loading) {
    return <div className="empty-state">جاري تحميل ملف المريض...</div>;
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

  return (
    <div className="page-stack">
      <div className="profile-toolbar">
        <Link className="action-hint" to="/patients">
          العودة إلى قائمة المرضى
        </Link>
        <Link className="primary-button" to={`/patients/${bundle.patient.id}/timeline`}>
          فتح السجل الزمني الكامل
        </Link>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <SectionCard
        title={safeDisplay(bundle.patient.fullName, "مريض غير متوفر")}
        subtitle={joinMeta([
          bundle.patient.unifiedId ?? "سجل محلي",
          bundle.patient.nationalId ?? "بدون هوية",
          bundle.patient.phone
        ])}
      >
        <div className="stats-strip">
          <div className="stat-pill">
            <strong>{formatCount(bundle.patient.visitCount)}</strong>
            <span>زيارات</span>
          </div>
          <div className="stat-pill">
            <strong>{formatCount(bundle.patient.labResultsCount)}</strong>
            <span>نتائج مختبر</span>
          </div>
          <div className="stat-pill">
            <strong>{formatCount(bundle.patient.referralCount)}</strong>
            <span>إحالات</span>
          </div>
          <div className="stat-pill">
            <strong>{formatCount(bundle.patient.timelineCount)}</strong>
            <span>أحداث طبية</span>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="تبويبات ملف المريض">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              className={activeTab === tab.value ? "tab-button active" : "tab-button"}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-panel">
          {activeTab === "basic" ? (
            <>
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
                  <strong>{safeDisplay(bundle.patient.bloodType)}</strong>
                </div>
                <div className="detail-field">
                  <span>جهة اتصال الطوارئ</span>
                  <strong>{safeDisplay(bundle.patient.emergencyContact)}</strong>
                </div>
                <div className="detail-field field-span-2">
                  <span>العنوان</span>
                  <strong>{safeDisplay(bundle.patient.address)}</strong>
                </div>
              </div>
              <div className="chip-row">
                {bundle.patient.centersSeenAt.length > 0 ? (
                  bundle.patient.centersSeenAt.map((center) => (
                    <span key={center.centerId} className="tag">
                      {center.centerName}
                    </span>
                  ))
                ) : (
                  <span className="tag">لا يوجد مركز مرتبط</span>
                )}
              </div>
              <p className="muted">
                آخر تحديث ظاهر في السجل: {bundle.patient.lastEventAt ? formatDateTime(bundle.patient.lastEventAt) : "غير متوفر"}
              </p>
            </>
          ) : null}

          {activeTab === "visits" ? (
            <EventList events={groupedEvents.visits} emptyText="لا توجد زيارات أو أحداث زيارة مسجلة." />
          ) : null}
          {activeTab === "referrals" ? (
            <EventList events={groupedEvents.referrals} emptyText="لا توجد إحالات مسجلة لهذا المريض." />
          ) : null}
          {activeTab === "diagnoses" ? (
            <EventList events={groupedEvents.diagnoses} emptyText="لا توجد تشخيصات مسجلة." />
          ) : null}
          {activeTab === "prescriptions" ? (
            <EventList events={groupedEvents.prescriptions} emptyText="لا توجد أدوية أو وصفات مسجلة." />
          ) : null}
          {activeTab === "conditions" ? (
            <div className="details-list">
              <div className="detail-field">
                <span>الحساسيات</span>
                <strong>{renderList(bundle.patient.allergies)}</strong>
              </div>
              <div className="detail-field">
                <span>الأمراض المزمنة</span>
                <strong>{renderList(bundle.patient.chronicDiseases)}</strong>
              </div>
            </div>
          ) : null}
          {activeTab === "files" ? (
            <EventList events={groupedEvents.files} emptyText="لا توجد ملفات أو تقارير مختبرية مرتبطة حاليا." />
          ) : null}
          {activeTab === "timeline" ? (
            <EventList events={groupedEvents.timeline} emptyText="لا توجد أحداث طبية مسجلة لهذا المريض حتى الآن." />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
