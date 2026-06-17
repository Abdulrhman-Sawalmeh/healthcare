interface AnalyticsCardProps {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}

export function AnalyticsCard({ label, value, helper, tone = "neutral" }: AnalyticsCardProps) {
  return (
    <article className={`analytics-card ${tone}`}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      {helper ? <span>{helper}</span> : null}
    </article>
  );
}
