import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterRecord } from "../types";

export function CentersPage() {
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCenterId = Number(searchParams.get("centerId") ?? "");
  const selectedCenterCode = searchParams.get("centerCode") ?? "";
  const focus = searchParams.get("focus") ?? "";

  useEffect(() => {
    apiRequest<CenterRecord[]>("/central/centers")
      .then((payload) => {
        setCenters(payload);
        setError("");
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleConnection(center: CenterRecord) {
    const nextState = !center.isConnected;

    const updated = await apiRequest<CenterRecord>(`/central/centers/${center.id}/connection`, {
      method: "PATCH",
      body: JSON.stringify({
        isConnected: nextState,
        reason: nextState ? undefined : "تم تعليق الاتصال مؤقتًا من لوحة التحكم المركزية."
      })
    });

    setCenters((current) => current.map((item) => (item.id === center.id ? updated : item)));
  }

  const visibleCenters = useMemo(() => {
    return centers.filter((center) => {
      if (selectedCenterId && center.id !== selectedCenterId) {
        return false;
      }

      if (selectedCenterCode && center.code !== selectedCenterCode) {
        return false;
      }

      return true;
    });
  }, [centers, selectedCenterCode, selectedCenterId]);

  const selectedCenter = useMemo(() => {
    return (
      centers.find((center) => center.id === selectedCenterId || center.code === selectedCenterCode) ?? null
    );
  }, [centers, selectedCenterCode, selectedCenterId]);

  if (loading) {
    return <div className="empty-state">جارٍ تحميل المراكز...</div>;
  }

  return (
    <div className="page-stack">
      <SectionCard
        title="سجل المراكز المرتبطة"
        subtitle="إدارة اتصال المراكز، ومراجعة جاهزيتها التشغيلية، ومتابعة قدرتها على استقبال الإحالات."
      >
        {error ? <div className="error-banner">{error}</div> : null}

        {selectedCenter ? (
          <div className="filter-summary">
            <div>
              <strong>{selectedCenter.name}</strong>
              <p className="muted">
                {focus === "load"
                  ? "تم الوصول إلى هذه الصفحة من مؤشرات الحمل في التقارير."
                  : focus === "visits"
                    ? "تم الوصول إلى هذه الصفحة من تحليل الزيارات أو من سجل الإشعارات."
                    : "تم تطبيق تحديد مباشر على هذا المركز."}
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
              عرض كل المراكز
            </button>
          </div>
        ) : null}

        {visibleCenters.length === 0 ? (
          <div className="empty-state compact">لا يوجد مركز يطابق التحديد الحالي.</div>
        ) : (
          <div className="card-grid">
            {visibleCenters.map((center) => {
              const isHighlighted =
                center.id === selectedCenterId || (selectedCenterCode && center.code === selectedCenterCode);

              return (
                <article
                  key={center.id}
                  className={`profile-tile${isHighlighted ? " highlighted-tile" : ""}`}
                >
                  <div className="tile-heading">
                    <div>
                      <p className="eyebrow">{center.code}</p>
                      <h3>{center.name}</h3>
                    </div>
                    <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                  </div>
                  <p>{joinMeta([toArabicLabel(center.type), center.city])}</p>
                  <div className="tile-stats">
                    <span>{center.availableDoctors}/{center.totalDoctors} أطباء متاحون</span>
                    <span>الحمل الحالي {center.currentLoad}</span>
                    <span>انتظار {center.averageWaitTime} دقيقة</span>
                  </div>
                  <p className="muted">{center.specialties.join("، ")}</p>
                  {center.suspensionReason ? <div className="inline-note">{center.suspensionReason}</div> : null}
                  <button className="ghost-button" type="button" onClick={() => void toggleConnection(center)}>
                    {center.isConnected ? "تعليق الاتصال" : "إعادة تفعيل المركز"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
