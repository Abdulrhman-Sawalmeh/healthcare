import { FormEvent } from "react";

import { CentralAnalyticsDashboardData } from "../../types";

export type AnalyticsRangePreset = "today" | "last7" | "last30" | "month" | "custom";

export interface AnalyticsFilterState {
  rangePreset: AnalyticsRangePreset;
  startDate: string;
  endDate: string;
  centerId: string;
  departmentId: string;
  doctorId: string;
}

interface AnalyticsFiltersProps {
  value: AnalyticsFilterState;
  metadata?: CentralAnalyticsDashboardData["filters"];
  onChange: (value: AnalyticsFilterState) => void;
  onApply: () => void;
}

const rangeOptions: Array<{ value: AnalyticsRangePreset; label: string }> = [
  { value: "today", label: "اليوم" },
  { value: "last7", label: "آخر 7 أيام" },
  { value: "last30", label: "آخر 30 يوم" },
  { value: "month", label: "هذا الشهر" },
  { value: "custom", label: "نطاق مخصص" }
];

function updateRange(value: AnalyticsFilterState, rangePreset: AnalyticsRangePreset): AnalyticsFilterState {
  return {
    ...value,
    rangePreset
  };
}

export function AnalyticsFilters({ value, metadata, onChange, onApply }: AnalyticsFiltersProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="analytics-filters" onSubmit={submit}>
      <label>
        <span>الفترة</span>
        <select
          value={value.rangePreset}
          onChange={(event) => onChange(updateRange(value, event.target.value as AnalyticsRangePreset))}
        >
          {rangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {value.rangePreset === "custom" ? (
        <>
          <label>
            <span>من</span>
            <input
              type="date"
              value={value.startDate}
              onChange={(event) => onChange({ ...value, startDate: event.target.value })}
            />
          </label>
          <label>
            <span>إلى</span>
            <input
              type="date"
              value={value.endDate}
              onChange={(event) => onChange({ ...value, endDate: event.target.value })}
            />
          </label>
        </>
      ) : null}

      <label>
        <span>المركز</span>
        <select value={value.centerId} onChange={(event) => onChange({ ...value, centerId: event.target.value })}>
          <option value="">كل المراكز</option>
          {metadata?.centers.map((center) => (
            <option key={center.id} value={center.id}>
              {center.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>القسم</span>
        <select
          value={value.departmentId}
          onChange={(event) => onChange({ ...value, departmentId: event.target.value })}
        >
          <option value="">كل الأقسام المتاحة</option>
          {metadata?.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name} - {department.centerName}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>الطبيب</span>
        <select value={value.doctorId} onChange={(event) => onChange({ ...value, doctorId: event.target.value })}>
          <option value="">كل الأطباء المتاحين</option>
          {metadata?.doctors.map((doctor) => (
            <option key={`${doctor.source}-${doctor.id}`} value={doctor.id}>
              {doctor.name}
            </option>
          ))}
        </select>
      </label>

      <button className="primary-button" type="submit">
        تطبيق الفلاتر
      </button>
    </form>
  );
}
