import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CentralAnalyticsDashboardData } from "../../types";
import { formatDateTime, toArabicLabel } from "../../lib/arabic";
import { AnalyticsEmptyState } from "./AnalyticsStates";

interface CenterComparisonCardProps {
  centers: CentralAnalyticsDashboardData["centerComparison"];
}

export function CenterComparisonCard({ centers }: CenterComparisonCardProps) {
  if (centers.length === 0) {
    return <AnalyticsEmptyState message="لا توجد مراكز مطابقة للفلاتر الحالية." />;
  }

  const chartData = centers.map((center) => ({
    name: center.name,
    الزيارات: center.visitCount,
    المرضى: center.patientCount,
    "حمل الطابور": center.queueLoad ?? 0,
    "إحالات صادرة": center.referralsSent,
    "إحالات واردة": center.referralsReceived
  }));

  const maxVisits = Math.max(...centers.map((center) => center.visitCount), 1);

  return (
    <div className="center-comparison">
      <div className="analytics-chart-height">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="الزيارات" fill="#2563eb" radius={[6, 6, 0, 0]} />
            <Bar dataKey="المرضى" fill="#0f766e" radius={[6, 6, 0, 0]} />
            <Bar dataKey="حمل الطابور" fill="#f59e0b" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="comparison-list">
        {centers.map((center) => (
          <article className="comparison-row" key={center.centerId}>
            <div>
              <strong>{center.name}</strong>
              <span>
                {center.code} - {toArabicLabel(center.type)}
              </span>
            </div>
            <div className="comparison-meter" aria-label={`زيارات ${center.name}`}>
              <span style={{ width: `${Math.max(8, (center.visitCount / maxVisits) * 100)}%` }} />
            </div>
            <dl>
              <div>
                <dt>زيارات</dt>
                <dd>{center.visitCount}</dd>
              </div>
              <div>
                <dt>مرضى</dt>
                <dd>{center.patientCount}</dd>
              </div>
              <div>
                <dt>انتظار</dt>
                <dd>{center.averageWaitingTime ?? "-"} د</dd>
              </div>
              <div>
                <dt>طابور</dt>
                <dd>{center.queueLoad ?? "-"}</dd>
              </div>
              <div>
                <dt>مكتملة</dt>
                <dd>{center.completedVisits}</dd>
              </div>
              <div>
                <dt>غير مكتملة</dt>
                <dd>{center.incompleteOrPendingVisits}</dd>
              </div>
            </dl>
            <p className="muted">
              آخر مزامنة: {center.lastSyncAt ? formatDateTime(center.lastSyncAt) : "لا توجد مزامنة مسجلة"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
