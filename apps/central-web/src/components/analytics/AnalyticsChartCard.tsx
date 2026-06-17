import { ReactNode } from "react";

interface AnalyticsChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AnalyticsChartCard({ title, subtitle, children, footer }: AnalyticsChartCardProps) {
  return (
    <section className="analytics-chart-card">
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </header>
      <div className="analytics-chart-body">{children}</div>
      {footer ? <div className="analytics-chart-footer">{footer}</div> : null}
    </section>
  );
}
