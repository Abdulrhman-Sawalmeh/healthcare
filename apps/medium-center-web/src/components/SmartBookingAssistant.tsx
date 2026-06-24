import { formatDateTime, toArabicLabel } from "../lib/arabic";
import {
  AppointmentFormSnapshot,
  BookingReasonPreset,
  SmartBookingInsight,
  bookingReasonPresets
} from "../lib/booking-assistant";

interface SmartBookingAssistantProps {
  form: AppointmentFormSnapshot;
  insight: SmartBookingInsight;
  readinessScore: number;
  visitTasks: string[];
  onApplyPreset: (preset: BookingReasonPreset) => void;
  onApplyInsight: () => void;
}

export function SmartBookingAssistant({
  form,
  insight,
  readinessScore,
  visitTasks,
  onApplyPreset,
  onApplyInsight
}: SmartBookingAssistantProps) {
  const hasContext = form.reason.trim().length >= 4 || form.notes.trim().length >= 4;

  return (
    <article className="section-card ai-assistant-card">
      <div className="assistant-glow assistant-glow-a" />
      <div className="assistant-glow assistant-glow-b" />

      <div className="ai-assistant-head">
        <div>
          <p className="eyebrow">مساعد الحجز الذكي</p>
          <h3>المساعد الذكي للحجز</h3>
        </div>
        <span className="tag">{insight.confidenceLabel}</span>
      </div>

      <div className="assistant-top-strip">
        <div className="assistant-score-card">
          <span>جاهزية الحجز</span>
          <strong>{readinessScore}%</strong>
        </div>
        <div className="assistant-score-copy">
          <strong>مساعد حجز تفاعلي</strong>
          <p className="muted">
            يساعدك في تحديد نوع الزيارة والأولوية والطبيب والموعد الأقرب اعتمادًا على تفاصيل الحجز المكتوبة.
          </p>
        </div>
      </div>

      <div className="assistant-preset-grid">
        {bookingReasonPresets.map((preset) => (
          <button
            key={preset.id}
            className="assistant-preset-button"
            type="button"
            onClick={() => onApplyPreset(preset)}
          >
            <strong>{preset.label}</strong>
            <span>{toArabicLabel(preset.type)}</span>
          </button>
        ))}
      </div>

      <div className="assistant-insight-shell">
        <div className="assistant-badges">
          <span className="assistant-badge">{insight.carePathLabel}</span>
          <span className="assistant-badge">{toArabicLabel(insight.recommendedPriority)}</span>
          <span className="assistant-badge">{toArabicLabel(insight.recommendedType)}</span>
        </div>

        <div className="assistant-summary">
          <strong>{hasContext ? insight.summary : "اكتب سبب الزيارة ليقترح المساعد المسار الأنسب."}</strong>
          <p className="muted">
            {hasContext
              ? "يمكنك تطبيق التوصية مباشرة أو تعديلها يدويًا قبل تثبيت الحجز."
              : "يمكنك أيضًا البدء بإحدى الحالات الشائعة أعلاه لتعبئة النموذج بسرعة."}
          </p>
        </div>

        {hasContext ? (
          <>
            <ul className="assistant-rationale">
              {insight.rationale.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            {insight.recommendedDoctor ? (
              <div className="assistant-focus-card">
                <span>الطبيب الأنسب</span>
                <strong>{insight.recommendedDoctor.fullName}</strong>
                <p className="muted">
                  {insight.recommendedDoctor.specialization} - {insight.recommendedDoctor.department.name}
                </p>
              </div>
            ) : null}

            {insight.recommendedSlot ? (
              <div className="assistant-focus-card">
                <span>أسرع موعد مناسب</span>
                <strong>{formatDateTime(insight.recommendedSlot.scheduledAt)}</strong>
                <p className="muted">{insight.recommendedSlot.note}</p>
              </div>
            ) : null}

            {insight.warning ? <div className="inline-note">{insight.warning}</div> : null}

            <div className="button-row">
              <button className="primary-button" type="button" onClick={onApplyInsight}>
                تطبيق التوصية الذكية
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="assistant-task-panel">
        <div className="info-row">
          <strong>تحضير مقترح قبل الموعد</strong>
          <span className="assistant-mini-count">{visitTasks.length} مهام</span>
        </div>
        <ul className="assistant-rationale">
          {visitTasks.slice(0, 4).map((task) => (
            <li key={task}>{task}</li>
          ))}
        </ul>
      </div>

      <p className="assistant-footnote">
        هذه توصية ذكية أولية للمساعدة في الحجز وليست تشخيصًا طبيًا.
      </p>
    </article>
  );
}
