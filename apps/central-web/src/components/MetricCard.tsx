import { Link } from "react-router-dom";

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
  to?: string;
  actionHint?: string;
}

export function MetricCard({ label, value, helper, to, actionHint }: MetricCardProps) {
  const content = (
    <>
      <p className="eyebrow">{label}</p>
      <h3>{value}</h3>
      <p className="muted">{helper}</p>
      {to && actionHint ? <p className="action-hint">{actionHint}</p> : null}
    </>
  );

  if (to) {
    return (
      <Link className="metric-card interactive-card" to={to}>
        {content}
      </Link>
    );
  }

  return <article className="metric-card">{content}</article>;
}
