import { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb-nav" aria-label="مسار الصفحة">
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`}>
              {item.to && !isLast ? (
                <Link className="breadcrumb-link" to={item.to}>
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumb-current">{item.label}</span>
              )}
              {!isLast ? <span className="breadcrumb-separator">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="page-header-side">
        {meta ? <span className="page-header-meta">{meta}</span> : null}
        {actions}
      </div>
    </header>
  );
}

export function LoadingState({ text = "جار تحميل البيانات..." }: { text?: string }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <span className="state-icon" aria-hidden="true">
        ...
      </span>
      <strong>{text}</strong>
    </div>
  );
}

export function EmptyState({
  title = "لا توجد بيانات",
  description,
  action
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block compact">
      <span className="state-icon" aria-hidden="true">
        -
      </span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "إعادة المحاولة"
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="state-block error" role="alert">
      <span className="state-icon" aria-hidden="true">
        !
      </span>
      <strong>تعذر تنفيذ العملية</strong>
      <p>{message}</p>
      {onRetry ? (
        <button className="ghost-button" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder,
  label = "بحث",
  buttonLabel = "بحث"
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  label?: string;
  buttonLabel?: string;
}) {
  return (
    <form className="content-tools search-box" onSubmit={onSubmit}>
      <label>
        <span className="visually-hidden">{label}</span>
        <input
          className="toolbar-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      <button className="ghost-button" type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}

export function ResultSummary({ count, label, query }: { count: number; label: string; query?: string }) {
  return (
    <div className="result-summary">
      <strong>{count}</strong>
      <span>{label}</span>
      {query ? <small>نتائج مطابقة للبحث: {query}</small> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPageChange
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination-bar" aria-label="تقسيم الصفحات">
      <button className="ghost-button" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        السابق
      </button>
      <span>
        صفحة {page} من {totalPages}
      </span>
      <button
        className="ghost-button"
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        التالي
      </button>
    </div>
  );
}

export function ExportButtons({
  onPdf,
  onExcel,
  disabled
}: {
  onPdf?: () => void;
  onExcel?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="export-buttons">
      <button className="ghost-button" type="button" disabled={disabled || !onPdf} onClick={onPdf}>
        PDF
      </button>
      <button className="ghost-button" type="button" disabled={disabled || !onExcel} onClick={onExcel}>
        Excel
      </button>
    </div>
  );
}
