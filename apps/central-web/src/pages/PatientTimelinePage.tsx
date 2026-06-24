import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { cleanDemoText, formatCount, formatDate, formatDateTime, joinMeta, safeDisplay, toArabicLabel } from "../lib/arabic";
import { PatientTimelineBundle, PatientTimelineEventType } from "../types";

type TimelineFilter = "all" | PatientTimelineEventType;

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

export function PatientTimelinePage() {
  const { patientId } = useParams();
  const [bundle, setBundle] = useState<PatientTimelineBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>("all");

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

  if (loading) {
    return <div className="empty-state">جاري تحميل السجل الزمني للمريض...</div>;
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
          safeDisplay(bundle.patient.fullName, "مريض غير متوفر"),
          bundle.patient.unifiedId ?? "سجل محلي",
          bundle.patient.nationalId ?? "بدون هوية"
        ])}
      >
        <div className="detail-grid">
          <div className="detail-field">
            <span>الهاتف</span>
            <strong>{safeDisplay(bundle.patient.phone)}</strong>
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
            <strong>{bundle.patient.lastEventAt ? formatDateTime(bundle.patient.lastEventAt) : "غير متوفر"}</strong>
          </div>
        </div>

        <div className="chip-row">
          {bundle.patient.centersSeenAt.map((center) => (
            <span key={center.centerId} className="tag">
              {center.centerName}
            </span>
          ))}
          {bundle.patient.centersSeenAt.length === 0 ? <span className="tag">لا يوجد مركز مرتبط</span> : null}
        </div>
      </SectionCard>

      <SectionCard title="الأحداث الطبية" subtitle="مرتبة من الأحدث إلى الأقدم مع فلترة حسب نوع الحدث.">
        <div className="timeline-filters">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={activeFilter === option.value ? "timeline-filter active" : "timeline-filter"}
              onClick={() => setActiveFilter(option.value)}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{formatCount(option.count)}</strong>
            </button>
          ))}
        </div>

        <p className="muted">
          {activeFilter === "all"
            ? `إجمالي الأحداث الظاهرة: ${formatCount(filteredEvents.length)}`
            : `الأحداث الظاهرة بعد الفلترة: ${formatCount(filteredEvents.length)}`}
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
                        <h4>{safeDisplay(event.title)}</h4>
                      </div>
                      <span className="timeline-date">{formatDateTime(event.date)}</span>
                    </div>
                    <p>{cleanDemoText(event.description)}</p>
                    <div className="timeline-meta">
                      <span>سجلها: {safeDisplay(event.createdBy)}</span>
                      <span>{safeDisplay(event.sourceTable)}</span>
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
