import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { PortalAppointmentSuggestionRecord } from "../types";

interface SuggestedAppointmentSlotsProps {
  suggestions: PortalAppointmentSuggestionRecord[];
  loading: boolean;
  error?: string;
  onSelect: (suggestion: PortalAppointmentSuggestionRecord) => void;
}

export function SuggestedAppointmentSlots({
  suggestions,
  loading,
  error,
  onSelect
}: SuggestedAppointmentSlotsProps) {
  if (!loading && !error && suggestions.length === 0) {
    return null;
  }

  const fastestSuggestion = suggestions[0];

  return (
    <div className="field-span-2 suggestions-shell">
      <div className="suggestions-header">
        <div>
          <strong>المواعيد المقترحة والمتاحة</strong>
          <p className="muted">اختر موعدًا متاحًا ليتم تعبئة النموذج مباشرة وبنفس بيانات الطبيب.</p>
        </div>
        {suggestions.length > 0 ? <span className="tag">{suggestions.length} مواعيد</span> : null}
      </div>

      {loading ? <div className="empty-state compact">جارٍ البحث عن أقرب المواعيد المتاحة...</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {!loading && fastestSuggestion ? (
        <article className="suggestion-featured-card">
          <div className="suggestion-featured-copy">
            <span className="eyebrow">الأسرع الآن</span>
            <strong>{formatDateTime(fastestSuggestion.scheduledAt)}</strong>
            <p className="muted">{fastestSuggestion.note}</p>
            <div className="assistant-badges">
              <span className="assistant-badge">{fastestSuggestion.doctor.fullName}</span>
              <span className="assistant-badge">{toArabicLabel(fastestSuggestion.type)}</span>
              <span className="assistant-badge">{toArabicLabel(fastestSuggestion.priority)}</span>
            </div>
          </div>
          <button className="primary-button" type="button" onClick={() => onSelect(fastestSuggestion)}>
            اختيار أسرع موعد
          </button>
        </article>
      ) : null}

      {!loading ? (
        <div className="suggestion-grid">
          {suggestions.map((suggestion, index) => (
            <article className="suggestion-card" key={`${suggestion.doctor.id}-${suggestion.scheduledAt}`}>
              <div className="info-row">
                <div>
                  <strong>{suggestion.doctor.fullName}</strong>
                  <p className="muted">{suggestion.doctor.department.name}</p>
                </div>
                {index === 0 ? <span className="tag">الأسرع</span> : <span className="tag">{toArabicLabel(suggestion.priority)}</span>}
              </div>
              <div className="tile-stats">
                <span>{formatDateTime(suggestion.scheduledAt)}</span>
                <span>{toArabicLabel(suggestion.type)}</span>
                <span>{suggestion.doctor.specialization}</span>
              </div>
              <p className="muted">{suggestion.note}</p>
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={() => onSelect(suggestion)}>
                  استخدام هذا الموعد
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
