import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterRecord } from "../types";

const defaultCenterForm = {
  centerCode: "",
  centerName: "",
  centerType: "MEDICAL_CENTER",
  region: "",
  city: "",
  address: "",
  phone: "",
  email: "",
  latitude: "0",
  longitude: "0",
  specialties: "",
  isConnected: true,
  apiEndpoint: "",
  apiKey: ""
};

function centerToForm(center: CenterRecord) {
  return {
    centerCode: center.code,
    centerName: center.name,
    centerType: center.type,
    region: center.region,
    city: center.city,
    address: center.address,
    phone: center.phone,
    email: center.email,
    latitude: "0",
    longitude: "0",
    specialties: center.specialties.join(", "),
    isConnected: center.isConnected,
    apiEndpoint: "",
    apiKey: ""
  };
}

function normalizeCenterPayload(form: typeof defaultCenterForm) {
  return {
    ...form,
    latitude: Number(form.latitude || 0),
    longitude: Number(form.longitude || 0),
    specialties: form.specialties
      .split(",")
      .map((specialty) => specialty.trim())
      .filter(Boolean)
  };
}

function matchesCenter(center: CenterRecord, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    center.code,
    center.name,
    center.type,
    center.region,
    center.city,
    center.address,
    center.phone,
    center.email,
    center.specialties.join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function CentersPage() {
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editingCenterId, setEditingCenterId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultCenterForm);
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCenterId = Number(searchParams.get("centerId") ?? "");
  const selectedCenterCode = searchParams.get("centerCode") ?? "";
  const focus = searchParams.get("focus") ?? "";

  async function loadCenters() {
    const payload = await apiRequest<CenterRecord[]>("/central/centers");
    setCenters(payload);
  }

  useEffect(() => {
    loadCenters()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingCenterId ? `/central/centers/${editingCenterId}` : "/central/centers";
    const method = editingCenterId ? "PUT" : "POST";

    try {
      await apiRequest<CenterRecord>(path, {
        method,
        body: JSON.stringify(normalizeCenterPayload(form))
      });
      await loadCenters();
      setForm(defaultCenterForm);
      setEditingCenterId(null);
      setError("");
      setSuccessMessage(editingCenterId ? "تم تحديث بيانات المركز." : "تمت إضافة المركز.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات المركز.");
    }
  }

  async function toggleConnection(center: CenterRecord) {
    const nextState = !center.isConnected;

    try {
      const updated = await apiRequest<CenterRecord>(`/central/centers/${center.id}/connection`, {
        method: "PATCH",
        body: JSON.stringify({
          isConnected: nextState,
          reason: nextState ? undefined : "تم إيقاف الاتصال من لوحة التحكم المركزية."
        })
      });

      setCenters((current) => current.map((item) => (item.id === center.id ? updated : item)));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة الاتصال.");
    }
  }

  async function deleteCenter(center: CenterRecord) {
    if (!window.confirm(`هل تريد حذف ${center.name}؟ قد يفشل الحذف إذا كان المركز مرتبطًا بمرضى أو زيارات أو إحالات.`)) {
      return;
    }

    try {
      await apiRequest(`/central/centers/${center.id}`, { method: "DELETE" });
      setCenters((current) => current.filter((item) => item.id !== center.id));
      setError("");
      setSuccessMessage("تم حذف بيانات المركز.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف بيانات المركز.");
    }
  }

  function editCenter(center: CenterRecord) {
    setEditingCenterId(center.id);
    setForm(centerToForm(center));
    setError("");
    setSuccessMessage("");
  }

  const visibleCenters = useMemo(() => {
    return centers.filter((center) => {
      if (selectedCenterId && center.id !== selectedCenterId) {
        return false;
      }

      if (selectedCenterCode && center.code !== selectedCenterCode) {
        return false;
      }

      return matchesCenter(center, query);
    });
  }, [centers, query, selectedCenterCode, selectedCenterId]);

  const selectedCenter = useMemo(() => {
    return centers.find((center) => center.id === selectedCenterId || center.code === selectedCenterCode) ?? null;
  }, [centers, selectedCenterCode, selectedCenterId]);

  if (loading) {
    return <div className="empty-state">جاري تحميل المراكز...</div>;
  }

  return (
    <div className="page-stack">
      <SectionCard
        title={editingCenterId ? "تعديل مركز" : "إضافة مركز"}
        subtitle="إدارة المستشفيات والمراكز والعيادات المتصلة والمستخدمة في الإحالات وتقارير الشبكة."
      >
        {successMessage ? <div className="credentials-banner">{successMessage}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>رمز المركز</span>
            <input
              value={form.centerCode}
              onChange={(event) => setForm((current) => ({ ...current, centerCode: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>اسم المركز</span>
            <input
              value={form.centerName}
              onChange={(event) => setForm((current) => ({ ...current, centerName: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>نوع المركز</span>
            <select
              value={form.centerType}
              onChange={(event) => setForm((current) => ({ ...current, centerType: event.target.value }))}
            >
              <option value="CLINIC">عيادة</option>
              <option value="MEDICAL_CENTER">مركز صحي</option>
              <option value="HOSPITAL">مستشفى</option>
            </select>
          </label>
          <label className="field">
            <span>المنطقة</span>
            <input
              value={form.region}
              onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>المدينة</span>
            <input
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>الهاتف</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>خط العرض</span>
            <input
              type="number"
              step="any"
              value={form.latitude}
              onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>خط الطول</span>
            <input
              type="number"
              step="any"
              value={form.longitude}
              onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))}
            />
          </label>
          <label className="field field-span-2">
            <span>العنوان</span>
            <input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              required
            />
          </label>
          <label className="field field-span-2">
            <span>التخصصات</span>
            <input
              value={form.specialties}
              onChange={(event) => setForm((current) => ({ ...current, specialties: event.target.value }))}
              placeholder="أمراض القلب، طب الأطفال، الطب الباطني"
            />
          </label>
          <label className="field field-span-2">
            <span>رابط واجهة API</span>
            <input
              value={form.apiEndpoint}
              onChange={(event) => setForm((current) => ({ ...current, apiEndpoint: event.target.value }))}
              placeholder="https://center-api.example.com/api"
            />
          </label>
          <label className="field field-span-2">
            <span>مفتاح API</span>
            <input
              value={form.apiKey}
              onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
            />
          </label>
          <label className="field checkbox-field field-span-2">
            <input
              checked={form.isConnected}
              onChange={(event) => setForm((current) => ({ ...current, isConnected: event.target.checked }))}
              type="checkbox"
            />
            <span>متصل ومسموح له بتبادل البيانات</span>
          </label>
          <div className="field-span-2 button-row">
            <button className="primary-button" type="submit">
              {editingCenterId ? "حفظ تعديلات المركز" : "إضافة المركز"}
            </button>
            {editingCenterId ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingCenterId(null);
                  setForm(defaultCenterForm);
                }}
              >
                إلغاء التعديل
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="سجل المراكز المتصلة"
        subtitle="ابحث عن المراكز، وعدّل حالة الاتصال، وحدّث البيانات، واحذف السجلات غير المستخدمة."
      >
        {selectedCenter ? (
          <div className="filter-summary">
            <div>
              <strong>{selectedCenter.name}</strong>
              <p className="muted">
                {focus === "load"
                  ? "تم فتحه من مؤشرات الحمل في التقارير."
                  : focus === "visits"
                    ? "تم فتحه من تحليل الزيارات أو الإشعارات."
                    : "يوجد فلتر مباشر على هذا المركز."}
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
              عرض جميع المراكز
            </button>
          </div>
        ) : null}

        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث برمز المركز أو الاسم أو المدينة أو النوع أو الهاتف أو البريد أو التخصص"
          />
        </form>

        {visibleCenters.length === 0 ? (
          <div className="empty-state compact">لا يوجد مركز يطابق الفلاتر الحالية.</div>
        ) : (
          <div className="card-grid">
            {visibleCenters.map((center) => {
              const isHighlighted =
                center.id === selectedCenterId || (selectedCenterCode && center.code === selectedCenterCode);

              return (
                <article key={center.id} className={`profile-tile${isHighlighted ? " highlighted-tile" : ""}`}>
                  <div className="tile-heading">
                    <div>
                      <p className="eyebrow">{center.code}</p>
                      <h3>{center.name}</h3>
                    </div>
                    <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                  </div>
                  <p>{joinMeta([toArabicLabel(center.type), center.city])}</p>
                  <p className="muted">{joinMeta([center.address, center.phone, center.email])}</p>
                  <div className="tile-stats">
                    <span>{center.availableDoctors}/{center.totalDoctors} أطباء متاحون</span>
                    <span>الحمل {center.currentLoad}</span>
                    <span>الانتظار {center.averageWaitTime} دقيقة</span>
                  </div>
                  <p className="muted">{center.specialties.join(", ") || "لا توجد تخصصات مسجلة."}</p>
                  {center.suspensionReason ? <div className="inline-note">{center.suspensionReason}</div> : null}
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => editCenter(center)}>
                      تعديل
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void toggleConnection(center)}>
                      {center.isConnected ? "إيقاف الاتصال" : "إعادة التفعيل"}
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void deleteCenter(center)}>
                      حذف
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
