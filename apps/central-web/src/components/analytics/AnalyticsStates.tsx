export function AnalyticsLoadingState() {
  return (
    <div className="analytics-state" role="status" aria-live="polite">
      <strong>جاري تحميل لوحة التحليلات...</strong>
      <span>يتم تجهيز المؤشرات من بيانات الشبكة الصحية.</span>
    </div>
  );
}

export function AnalyticsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="analytics-state error" role="alert">
      <strong>تعذر تحميل لوحة التحليلات</strong>
      <span>{message}</span>
      <button className="ghost-button" type="button" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
}

export function AnalyticsEmptyState({
  title = "لا توجد بيانات كافية",
  message
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="analytics-empty-state">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}
