import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { cleanDemoText, formatCount, formatDateTime, joinMeta, safeDisplay, toArabicLabel } from "../lib/arabic";
import { CentralNotificationsBundle } from "../types";

type DirectionFilter = "" | "outgoing" | "incoming" | "logs";

type NotificationListItem = {
  id: string;
  rawId: number;
  direction: DirectionFilter;
  notificationType: string;
  status: string;
  centerName?: string;
  centerCode?: string;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  completedAt?: string | null;
  attempts?: number;
  maxRetries?: number;
  payload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  notes?: string | null;
  count?: number;
  groupItems?: NotificationListItem[];
};

function buildPath(path: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function buildNotificationTarget(notificationType: string, centerCode?: string) {
  switch (notificationType) {
    case "REFERRAL_REQUEST":
    case "NOTIFY_REFERRAL":
    case "NOTIFY_REFERRAL_RESPONSE":
      return { to: "/referrals", label: "فتح الإحالة" };
    case "SYNC_MASTER_DATA":
      return { to: "/master-data", label: "فتح البيانات المرجعية" };
    case "REQUEST_PATIENT_DATA":
      return { to: "/patients", label: "فتح المرضى" };
    case "REQUEST_NEW_VISITS":
      return {
        to: buildPath(centerCode ? "/centers" : "/reports", {
          centerCode,
          focus: "visits"
        }),
        label: centerCode ? "فتح المركز" : "فتح تقرير الزيارات"
      };
    case "REQUEST_LAB_RESULTS":
    case "PING":
    case "ALERT":
    default:
      return {
        to: centerCode ? buildPath("/centers", { centerCode, focus: "visits" }) : "/centers",
        label: centerCode ? "فتح المركز" : "فتح المراكز"
      };
  }
}

function extractRelatedEntity(item: NotificationListItem) {
  const payload = item.payload ?? item.responsePayload ?? {};
  const referralId = payload.referral_id ?? payload.referralId;
  const centerId = payload.center_id ?? payload.centerId;
  const entity = referralId ? `CentralReferral #${referralId}` : centerId ? `Center #${centerId}` : null;
  return entity ?? "غير متوفر";
}

function groupItems(items: NotificationListItem[]) {
  const groups = new Map<string, NotificationListItem[]>();

  for (const item of items) {
    const key = [item.direction, item.notificationType, item.status, item.centerCode ?? "central"].join("|");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.values()).map((group) => {
    const latest = [...group].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return {
      ...latest,
      count: group.length,
      groupItems: group
    };
  });
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{safeDisplay(value)}</strong>
    </div>
  );
}

export function NotificationsPage() {
  const [centralBundle, setCentralBundle] = useState<CentralNotificationsBundle | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [centerCodeFilter, setCenterCodeFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<NotificationListItem | null>(null);

  async function loadData() {
    setCentralBundle(await apiRequest<CentralNotificationsBundle>("/central/notifications"));
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  async function processQueues() {
    setProcessing(true);

    try {
      await apiRequest("/central/process", {
        method: "POST"
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إعادة معالجة الإشعارات المعلقة.");
    } finally {
      setProcessing(false);
    }
  }

  const allItems = useMemo<NotificationListItem[]>(() => {
    if (!centralBundle) {
      return [];
    }

    return [
      ...centralBundle.outgoing.map((item) => ({
        id: `out-${item.id}`,
        rawId: item.id,
        direction: "outgoing" as DirectionFilter,
        notificationType: item.notificationType,
        status: item.status,
        centerName: item.targetCenter.centerName,
        centerCode: item.targetCenter.centerCode,
        createdAt: item.createdAt,
        sentAt: item.sentAt,
        completedAt: item.completedAt,
        attempts: item.retryCount,
        maxRetries: item.maxRetries,
        payload: item.payload,
        responsePayload: item.responsePayload,
        errorMessage: item.responseError
      })),
      ...centralBundle.incoming.map((item) => ({
        id: `in-${item.id}`,
        rawId: item.id,
        direction: "incoming" as DirectionFilter,
        notificationType: item.notificationType,
        status: item.status,
        centerName: item.fromCenter.centerName,
        centerCode: item.fromCenter.centerCode,
        createdAt: item.receivedAt,
        receivedAt: item.receivedAt,
        completedAt: item.processedAt,
        payload: item.payload,
        notes: item.notes
      })),
      ...centralBundle.communicationLogs.map((log) => ({
        id: `log-${log.id}`,
        rawId: log.id,
        direction: "logs" as DirectionFilter,
        notificationType: log.notificationType,
        status: log.status,
        centerName: log.center?.centerName,
        centerCode: log.center?.centerCode,
        createdAt: log.createdAt,
        payload: log.requestPayload,
        responsePayload: log.responsePayload,
        errorMessage: log.errorMessage
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [centralBundle]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      if (typeFilter && item.notificationType !== typeFilter) {
        return false;
      }

      if (centerCodeFilter && item.centerCode !== centerCodeFilter) {
        return false;
      }

      if (directionFilter && item.direction !== directionFilter) {
        return false;
      }

      if (dateFilter && item.createdAt.slice(0, 10) !== dateFilter) {
        return false;
      }

      return true;
    });
  }, [allItems, centerCodeFilter, dateFilter, directionFilter, statusFilter, typeFilter]);

  const groupedItems = useMemo(() => groupItems(filteredItems), [filteredItems]);

  const typeOptions = useMemo(
    () => Array.from(new Set(allItems.map((item) => item.notificationType))).sort((a, b) => a.localeCompare(b, "ar")),
    [allItems]
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(allItems.map((item) => item.status))).sort((a, b) => a.localeCompare(b, "ar")),
    [allItems]
  );
  const centerOptions = useMemo(
    () =>
      Array.from(
        new Map(allItems.filter((item) => item.centerCode).map((item) => [item.centerCode!, item.centerName ?? item.centerCode!]))
      ).sort((a, b) => a[1].localeCompare(b[1], "ar")),
    [allItems]
  );

  if (!centralBundle) {
    return <div className="empty-state">جاري تحميل الإشعارات...</div>;
  }

  const total = centralBundle.outgoing.length + centralBundle.incoming.length;
  const outgoing = centralBundle.outgoing.length;
  const incoming = centralBundle.incoming.length;
  const completed = allItems.filter((item) => item.status === "COMPLETED").length;
  const pending = allItems.filter((item) => ["PENDING", "PROCESSING"].includes(item.status)).length;
  const failed = allItems.filter((item) => ["FAILED", "PERMANENT_FAILURE"].includes(item.status)).length;

  return (
    <div className="page-stack">
      <SectionCard
        title="مركز الإشعارات المركزي"
        subtitle="متابعة الإشعارات الصادرة والواردة وسجل الاتصال مع تجميع السجلات المتشابهة."
        action={
          <button className="primary-button" type="button" onClick={() => void processQueues()}>
            {processing ? "جاري المعالجة..." : "إعادة معالجة الإشعارات المعلقة"}
          </button>
        }
      >
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="summary-grid">
          <div className="summary-card">
            <span>إجمالي الإشعارات</span>
            <strong>{formatCount(total)}</strong>
          </div>
          <div className="summary-card">
            <span>الصادرة</span>
            <strong>{formatCount(outgoing)}</strong>
          </div>
          <div className="summary-card">
            <span>الواردة</span>
            <strong>{formatCount(incoming)}</strong>
          </div>
          <div className="summary-card">
            <span>المكتملة</span>
            <strong>{formatCount(completed)}</strong>
          </div>
          <div className="summary-card">
            <span>المعلقة</span>
            <strong>{formatCount(pending)}</strong>
          </div>
          <div className="summary-card">
            <span>الفاشلة</span>
            <strong>{formatCount(failed)}</strong>
          </div>
        </div>

        <div className="inline-note">
          الحالات: مرسل، تم الاستلام، تمت المعالجة، فشل الإرسال، وبانتظار إعادة المحاولة بحسب حالة السجل الحالية.
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>المركز</span>
            <select value={centerCodeFilter} onChange={(event) => setCenterCodeFilter(event.target.value)}>
              <option value="">كل المراكز</option>
              {centerOptions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>نوع الإشعار</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">كل الأنواع</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {toArabicLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الحالة</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">كل الحالات</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {toArabicLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الاتجاه</span>
            <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as DirectionFilter)}>
              <option value="">الكل</option>
              <option value="outgoing">صادر</option>
              <option value="incoming">وارد</option>
              <option value="logs">سجل الاتصال</option>
            </select>
          </label>
          <label className="field">
            <span>التاريخ</span>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
        </div>

        {incoming === 0 && (!directionFilter || directionFilter === "incoming") ? (
          <div className="empty-state compact">لا توجد إشعارات واردة حاليًا</div>
        ) : null}

        {groupedItems.length === 0 ? (
          <div className="empty-state compact">لا توجد إشعارات أو سجلات تطابق الفلاتر الحالية.</div>
        ) : (
          <div className="stack-list">
            {groupedItems.map((item) => {
              const primaryTarget = buildNotificationTarget(item.notificationType, item.centerCode);

              return (
                <article className="stack-item" key={item.id}>
                  <div className="info-row">
                    <div>
                      <strong>{toArabicLabel(item.notificationType)}</strong>
                      <p className="muted">
                        {joinMeta([
                          item.direction === "outgoing"
                            ? "صادر"
                            : item.direction === "incoming"
                              ? "وارد"
                              : "سجل اتصال",
                          item.centerName,
                          item.centerCode,
                          item.count && item.count > 1 ? `${formatCount(item.count)} سجلات متشابهة` : null
                        ])}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <span className="muted">{formatDateTime(item.createdAt)}</span>
                  {item.errorMessage ? <p className="inline-note">{cleanDemoText(item.errorMessage)}</p> : null}
                  <div className="button-row">
                    <Link className="ghost-button" to={primaryTarget.to}>
                      {primaryTarget.label}
                    </Link>
                    {item.centerCode ? (
                      <Link className="ghost-button" to={buildPath("/centers", { centerCode: item.centerCode, focus: "visits" })}>
                        فتح المركز
                      </Link>
                    ) : null}
                    <button className="ghost-button" type="button" onClick={() => setSelectedItem(item)}>
                      عرض التفاصيل
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setTypeFilter(item.notificationType);
                        setCenterCodeFilter(item.centerCode ?? "");
                        setStatusFilter(item.status);
                      }}
                    >
                      عرض السجلات المرتبطة
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      {selectedItem ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="notification-details-title">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">إشعار #{selectedItem.rawId}</p>
                <h2 id="notification-details-title">تفاصيل الإشعار</h2>
              </div>
              <button className="ghost-button modal-close-button" type="button" onClick={() => setSelectedItem(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" onWheel={(event) => event.stopPropagation()}>
              <div className="details-list">
                <DetailField label="نوع الإشعار" value={toArabicLabel(selectedItem.notificationType)} />
                <DetailField
                  label="المصدر"
                  value={selectedItem.direction === "incoming" ? selectedItem.centerName : "النظام المركزي"}
                />
                <DetailField
                  label="الوجهة"
                  value={selectedItem.direction === "outgoing" ? selectedItem.centerName : "النظام المركزي"}
                />
                <DetailField label="المركز المرتبط" value={joinMeta([selectedItem.centerName, selectedItem.centerCode])} />
                <DetailField label="الكيان المرتبط" value={extractRelatedEntity(selectedItem)} />
                <DetailField label="وقت الإرسال" value={selectedItem.sentAt ? formatDateTime(selectedItem.sentAt) : null} />
                <DetailField label="وقت الاستلام" value={selectedItem.receivedAt ? formatDateTime(selectedItem.receivedAt) : null} />
                <DetailField label="عدد المحاولات" value={selectedItem.attempts != null ? `${selectedItem.attempts}/${selectedItem.maxRetries ?? 0}` : "لا يوجد"} />
                <DetailField label="نتيجة المعالجة" value={selectedItem.errorMessage ?? selectedItem.notes ?? toArabicLabel(selectedItem.status)} />
              </div>
              {selectedItem.count && selectedItem.count > 1 ? (
                <SectionCard title="السجلات المتشابهة" className="inset-card">
                  <div className="stack-list compact">
                    {selectedItem.groupItems?.map((item) => (
                      <div className="info-row" key={item.id}>
                        <span>{formatDateTime(item.createdAt)}</span>
                        <StatusBadge status={item.status} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
