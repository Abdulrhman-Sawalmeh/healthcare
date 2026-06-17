import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { apiRequest } from "../api/client";
import { AnalyticsCard } from "../components/analytics/AnalyticsCard";
import { AnalyticsChartCard } from "../components/analytics/AnalyticsChartCard";
import {
  AnalyticsFilterState,
  AnalyticsFilters
} from "../components/analytics/AnalyticsFilters";
import {
  AnalyticsEmptyState,
  AnalyticsErrorState,
  AnalyticsLoadingState
} from "../components/analytics/AnalyticsStates";
import { CenterComparisonCard } from "../components/analytics/CenterComparisonCard";
import { SystemHealthWidget } from "../components/analytics/SystemHealthWidget";
import { TopListTable } from "../components/analytics/TopListTable";
import { StatusBadge } from "../components/StatusBadge";
import { PageHeader } from "../components/UiStates";
import { formatDate, formatDateTime, toArabicLabel } from "../lib/arabic";
import { AnalyticsCountItem, CentralAnalyticsDashboardData } from "../types";

const chartColors = ["#2563eb", "#0f766e", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#64748b"];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): AnalyticsFilterState {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 29);

  return {
    rangePreset: "last30",
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(now),
    centerId: "",
    departmentId: "",
    doctorId: ""
  };
}

function calculateDateRange(filters: AnalyticsFilterState) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  if (filters.rangePreset === "today") {
    start = new Date(now);
  } else if (filters.rangePreset === "last7") {
    start.setDate(now.getDate() - 6);
  } else if (filters.rangePreset === "last30") {
    start.setDate(now.getDate() - 29);
  } else if (filters.rangePreset === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    return {
      startDate: filters.startDate,
      endDate: filters.endDate
    };
  }

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end)
  };
}

function buildAnalyticsPath(filters: AnalyticsFilterState) {
  const searchParams = new URLSearchParams();
  const range = calculateDateRange(filters);

  if (range.startDate) {
    searchParams.set("startDate", range.startDate);
  }

  if (range.endDate) {
    searchParams.set("endDate", range.endDate);
  }

  if (filters.centerId) {
    searchParams.set("centerId", filters.centerId);
  }

  if (filters.departmentId) {
    searchParams.set("departmentId", filters.departmentId);
  }

  if (filters.doctorId) {
    searchParams.set("doctorId", filters.doctorId);
  }

  const query = searchParams.toString();
  return `/central/analytics/dashboard${query ? `?${query}` : ""}`;
}

function formatValue(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${new Intl.NumberFormat("ar-EG").format(value)}${suffix}`;
}

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "لا توجد قرارات كافية";
  }

  return `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 }).format(value)}%`;
}

function countItemsToChart(items: AnalyticsCountItem[]) {
  return items.map((item) => ({
    name: toArabicLabel(item.key),
    count: item.count
  }));
}

function SimplePieChart({ items }: { items: AnalyticsCountItem[] }) {
  const data = countItemsToChart(items);

  if (data.length === 0) {
    return <AnalyticsEmptyState message="لا توجد بيانات كافية للرسم ضمن الفلاتر الحالية." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="name" innerRadius={54} outerRadius={92} paddingAngle={3}>
          {data.map((item, index) => (
            <Cell key={item.name} fill={chartColors[index % chartColors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function SimpleBarChart({
  items,
  dataKey = "count",
  nameKey = "name",
  color = "#2563eb"
}: {
  items: Array<Record<string, string | number>>;
  dataKey?: string;
  nameKey?: string;
  color?: string;
}) {
  if (items.length === 0) {
    return <AnalyticsEmptyState message="لا توجد بيانات كافية للرسم ضمن الفلاتر الحالية." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={items} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={nameKey} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VisitsLineChart({ data }: { data: CentralAnalyticsDashboardData["visits"]["perDayLast7"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="count" name="الزيارات" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function unavailable(message: string) {
  return <AnalyticsEmptyState title="المؤشر غير متاح" message={message} />;
}

function InlineMetric({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className={`analytics-inline-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function CentralAnalyticsDashboardPage() {
  const [filters, setFilters] = useState<AnalyticsFilterState>(() => defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilterState>(() => defaultFilters());
  const [data, setData] = useState<CentralAnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback((nextFilters: AnalyticsFilterState) => {
    setLoading(true);
    setError("");

    apiRequest<CentralAnalyticsDashboardData>(buildAnalyticsPath(nextFilters))
      .then((payload) => {
        setData(payload);
      })
      .catch((cause: Error) => {
        setError(cause.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadDashboard(appliedFilters);
  }, [appliedFilters, loadDashboard]);

  const rangeLabel = useMemo(() => {
    if (!data) {
      return "";
    }

    return `${formatDate(data.filters.startDate)} - ${formatDate(data.filters.endDate)}`;
  }, [data]);

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function updateFilters(nextFilters: AnalyticsFilterState) {
    setFilters(nextFilters);
  }

  if (loading && !data) {
    return <AnalyticsLoadingState />;
  }

  if (error && !data) {
    return <AnalyticsErrorState message={error} onRetry={() => loadDashboard(appliedFilters)} />;
  }

  if (!data) {
    return <AnalyticsEmptyState message="لا توجد بيانات تحليلات متاحة حاليًا." />;
  }

  const appointmentStatusChart = countItemsToChart(data.appointments.statusBreakdown);
  const labStatusChart = countItemsToChart([
    { key: "PENDING", count: data.lab.pending },
    { key: "IN_PROGRESS", count: data.lab.inProgress },
    { key: "COMPLETED", count: data.lab.completed },
    { key: "CANCELLED", count: data.lab.cancelled }
  ]);

  return (
    <div className="page-stack analytics-page">
      <PageHeader
        eyebrow="النظام المركزي"
        title="لوحة التحليلات"
        subtitle="مراقبة تشغيلية مجمعة للشبكة الصحية مع مقارنة بين المركز الصحي المتوسط والمركز الصحي الصغير."
        meta={`آخر تحديث: ${formatDateTime(data.generatedAt)}`}
      />

      <AnalyticsFilters value={filters} metadata={data.filters} onChange={updateFilters} onApply={applyFilters} />

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="filter-summary">
        <div>
          <strong>نطاق التحليل الحالي</strong>
          <p className="muted">{rangeLabel}</p>
        </div>
        <span className="status-badge neutral">
          {data.filters.centerId
            ? data.filters.centers.find((center) => center.id === data.filters.centerId)?.name ?? "مركز محدد"
            : "كل المراكز"}
        </span>
      </div>

      <section className="analytics-kpi-grid" aria-label="المؤشرات العامة">
        <AnalyticsCard
          label="إجمالي المرضى"
          value={formatValue(data.overview.totalPatients)}
          helper={`${formatValue(data.overview.totalLocalPatientRecords)} سجل محلي`}
          tone="success"
        />
        <AnalyticsCard label="إجمالي الزيارات" value={formatValue(data.overview.totalVisits)} />
        <AnalyticsCard label="زيارات اليوم" value={formatValue(data.overview.todaysVisits)} />
        <AnalyticsCard label="المراكز النشطة" value={formatValue(data.overview.activeCenters)} tone="success" />
        <AnalyticsCard label="إحالات معلقة" value={formatValue(data.overview.pendingReferrals)} tone="warning" />
        <AnalyticsCard label="إحالات مكتملة" value={formatValue(data.overview.completedReferrals)} tone="success" />
        <AnalyticsCard label="فشل المزامنة" value={formatValue(data.overview.failedSyncOperations)} tone="danger" />
        <AnalyticsCard
          label="متوسط الانتظار"
          value={formatValue(data.overview.averageWaitingTime, " د")}
          helper="من snapshots الحمل المتاحة"
        />
        <AnalyticsCard label="مرضى في الطابور" value={formatValue(data.overview.patientsCurrentlyInQueue)} />
        <AnalyticsCard label="مواعيد اليوم" value={formatValue(data.overview.appointmentsToday)} />
      </section>

      <AnalyticsChartCard
        title="مقارنة المراكز"
        subtitle="مقارنة تشغيلية بين المركز المتوسط والصغير حسب الزيارات، المرضى، الإحالات، والحمل الحالي."
      >
        <CenterComparisonCard centers={data.centerComparison} />
      </AnalyticsChartCard>

      <div className="analytics-section-grid">
        <AnalyticsChartCard title="الزيارات خلال آخر 7 أيام" subtitle="اتجاه الزيارات المسجلة محليًا.">
          <div className="analytics-chart-height">
            <VisitsLineChart data={data.visits.perDayLast7} />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="الزيارات الشهرية" subtitle="آخر ستة أشهر ضمن البيانات المتاحة.">
          <div className="analytics-chart-height">
            <SimpleBarChart
              items={data.visits.perMonth.map((item) => ({ name: item.month, count: item.count }))}
              color="#0f766e"
            />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="اكتمال الزيارات" subtitle="يعتمد على حالة المزامنة لأنها حالة الاكتمال المتاحة مركزيًا.">
          <div className="analytics-chart-height">
            <SimplePieChart items={data.visits.completedVsIncomplete} />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="أسباب الزيارات الأكثر تكرارًا" subtitle="من حقل التشخيص في الزيارات المحلية.">
          <TopListTable items={data.visits.mostCommonReasons} label="السبب" />
        </AnalyticsChartCard>
      </div>

      <div className="analytics-section-grid">
        <AnalyticsChartCard title="تحليلات الإحالات" subtitle={`معدل قبول الإحالات: ${formatRate(data.referrals.acceptanceRate)}`}>
          <div className="analytics-chart-height">
            <SimplePieChart items={data.referrals.statusBreakdown} />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="أولوية الإحالات" subtitle="توزيع normal / urgent / emergency حسب البيانات المتاحة.">
          <div className="analytics-chart-height">
            <SimpleBarChart items={countItemsToChart(data.referrals.priorityBreakdown)} color="#f59e0b" />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="أكثر أسباب الإحالة" subtitle="لا يتم عرض ملاحظات طبية حساسة؛ فقط السبب المجمع.">
          <TopListTable items={data.referrals.mostCommonReasons} label="سبب الإحالة" />
        </AnalyticsChartCard>

        <AnalyticsChartCard title="المسار من الصغير إلى المتوسط" subtitle="عدد الإحالات من C001 إلى M002 عندما تتوفر الأكواد.">
          <div className="analytics-mini-summary">
            <strong>{formatValue(data.referrals.smallToMedium)}</strong>
            <span>إحالة من المركز الصغير إلى المركز المتوسط</span>
          </div>
        </AnalyticsChartCard>
      </div>

      <div className="analytics-section-grid">
        <AnalyticsChartCard title="حالات المواعيد" subtitle="يعتمد على نموذج المواعيد المركزي القديم المرتبط بالأقسام والأطباء.">
          <div className="analytics-chart-height">
            {appointmentStatusChart.length === 0 ? (
              <AnalyticsEmptyState message="لا توجد مواعيد مطابقة للفلاتر الحالية." />
            ) : (
              <SimpleBarChart items={appointmentStatusChart} color="#7c3aed" />
            )}
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="المواعيد حسب التاريخ" subtitle="عدد المواعيد المجدولة لكل يوم ضمن الفترة.">
          <div className="analytics-chart-height">
            <VisitsLineChart data={data.appointments.byDate} />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="المواعيد حسب الطبيب" subtitle="قائمة مجمعة بدون بيانات مرضى.">
          <TopListTable items={data.appointments.byDoctor} label="الطبيب" valueLabel="مواعيد" />
        </AnalyticsChartCard>

        <AnalyticsChartCard title="مؤشرات غير متاحة للزيارات" subtitle="لا يتم استنتاج بيانات غير موجودة.">
          <div className="analytics-unavailable-list">
            {unavailable(data.visits.localVsReferred.message)}
            {unavailable(data.visits.averageVisitDuration.message)}
            {unavailable(data.visits.cancelledVisits.message)}
          </div>
        </AnalyticsChartCard>
      </div>

      <div className="analytics-section-grid">
        <AnalyticsChartCard title="الطابور والانتظار" subtitle="يعتمد على snapshots الحمل الحالية لكل مركز.">
          <div className="analytics-mini-grid">
            <InlineMetric label="ينتظرون الآن" value={formatValue(data.queue.currentWaiting)} tone="warning" />
            <InlineMetric label="متوسط الانتظار" value={formatValue(data.queue.averageWaitingTime, " د")} />
            <InlineMetric label="زيارات مكتملة اليوم" value={formatValue(data.queue.completedVisitsToday)} />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="مراحل الطابور" subtitle="حالة نقص بيانات صريحة بدل أرقام افتراضية.">
          <div className="analytics-unavailable-list">
            {unavailable(data.queue.patientsByStage.message)}
            {unavailable(data.queue.bottleneckStage.message)}
            {unavailable(data.queue.averageTimeByStage.message)}
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="طلبات المختبر" subtitle={`متوسط إكمال المختبر: ${formatValue(data.lab.averageCompletionMinutes, " د")}`}>
          <div className="analytics-chart-height">
            <SimpleBarChart items={labStatusChart} color="#0891b2" />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="أكثر الفحوصات طلبًا" subtitle="تجميع حسب اسم الفحص فقط.">
          <TopListTable items={data.lab.mostRequestedTests} label="الفحص" />
        </AnalyticsChartCard>
      </div>

      <div className="analytics-section-grid">
        <AnalyticsChartCard title="حمل المختبر اليومي" subtitle="طلبات المختبر حسب تاريخ الطلب.">
          <div className="analytics-chart-height">
            <VisitsLineChart data={data.lab.workloadByDay} />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="الصيدلية والوصفات" subtitle="إجمالي الوصفات وصرفها ضمن الفترة.">
          <div className="analytics-mini-grid">
            <InlineMetric label="إجمالي الوصفات" value={formatValue(data.pharmacy.totalPrescriptions)} />
            <InlineMetric label="بانتظار الصرف" value={formatValue(data.pharmacy.pendingPrescriptions)} tone="warning" />
            <InlineMetric label="مصروفة" value={formatValue(data.pharmacy.dispensedPrescriptions)} tone="success" />
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard title="أكثر الأدوية وصفًا" subtitle="لا يتضمن أي بيانات شخصية للمرضى.">
          <TopListTable items={data.pharmacy.mostPrescribedMedicines} label="الدواء" />
        </AnalyticsChartCard>

        <AnalyticsChartCard title="الوصفات حسب الطبيب" subtitle="تجميع عبء الصيدلية حسب الطبيب عندما يكون مرتبطًا بالزيارة.">
          <TopListTable items={data.pharmacy.prescriptionsByDoctor} label="الطبيب" valueLabel="وصفات" />
        </AnalyticsChartCard>
      </div>

      <AnalyticsChartCard title="عبء الأطباء والطاقم" subtitle="زيارات وفحوصات ووصفات مجمعة بدون إظهار بيانات مرضى.">
        {data.staffWorkload.length === 0 ? (
          <AnalyticsEmptyState message="لا توجد بيانات عبء أطباء مطابقة للفلاتر الحالية." />
        ) : (
          <div className="table-shell">
            <table className="data-table analytics-table">
              <thead>
                <tr>
                  <th>الطبيب</th>
                  <th>الزيارات</th>
                  <th>زيارات مكتملة</th>
                  <th>طلبات مختبر</th>
                  <th>وصفات</th>
                  <th>مواعيد</th>
                  <th>إحالات</th>
                </tr>
              </thead>
              <tbody>
                {data.staffWorkload.map((doctor) => (
                  <tr key={doctor.doctorId}>
                    <td>{doctor.doctorName}</td>
                    <td>{doctor.visits}</td>
                    <td>{doctor.completedVisits}</td>
                    <td>{doctor.labRequests}</td>
                    <td>{doctor.prescriptions}</td>
                    <td>{doctor.appointments ?? "غير متاح"}</td>
                    <td>{doctor.referrals ?? "غير متاح"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnalyticsChartCard>

      <AnalyticsChartCard title="صحة النظام والمزامنة" subtitle="آخر حالة اتصال ومزامنة وتنبيهات على مستوى المراكز.">
        <SystemHealthWidget health={data.systemHealth} />
      </AnalyticsChartCard>

      <AnalyticsChartCard title="حدود البيانات الحالية" subtitle="هذه المؤشرات موثقة حتى لا يتم تقديم أرقام غير حقيقية.">
        <div className="limitations-list">
          {data.limitations.map((item) => (
            <div className="info-row" key={item}>
              <span>{item}</span>
              <StatusBadge status="warning" />
            </div>
          ))}
        </div>
      </AnalyticsChartCard>
    </div>
  );
}
