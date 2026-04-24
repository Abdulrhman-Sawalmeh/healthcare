import { PropsWithChildren, ReactNode } from "react";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  subtitle,
  action,
  className = "",
  children
}: SectionCardProps) {
  return (
    <section className={`section-card ${className}`.trim()}>
      <header className="section-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
