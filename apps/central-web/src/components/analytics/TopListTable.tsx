import { AnalyticsCountItem } from "../../types";
import { formatCount, toArabicLabel } from "../../lib/arabic";
import { AnalyticsEmptyState } from "./AnalyticsStates";

interface TopListTableProps {
  items: AnalyticsCountItem[];
  label: string;
  valueLabel?: string;
}

export function TopListTable({ items, label, valueLabel = "العدد" }: TopListTableProps) {
  if (items.length === 0) {
    return <AnalyticsEmptyState message="لا توجد بيانات كافية لعرض هذه القائمة ضمن الفلاتر الحالية." />;
  }

  return (
    <div className="table-shell compact">
      <table className="data-table analytics-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th>{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key}>
              <td>{toArabicLabel(item.key)}</td>
              <td>{formatCount(item.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
